-- ============================================================
-- M5: Volunteer lifecycle — withdrawal, cancellation, persistent
--     helper completion. (Design: WITHDRAWAL_PROPOSAL.md incl. §9.)
--
-- Authorized by the founder 2026-10-13 for the DEVELOPMENT
-- database only, subject to pre-execution safeguards:
--   1. Duplicate active offers checked before the partial unique
--      index is built (pre-check in §2 below fails the migration
--      loudly rather than altering any data).
--   2. Critical-notification rules reconciled with the test
--      battery (actor-distinct events are never deduped away;
--      see §4 and supabase/tests/it_dev_m5.mjs).
--   3. Row locking, grants, SECURITY DEFINER + search_path, and
--      failure atomicity verified (this file is one transaction;
--      PostgreSQL DDL is transactional — any failure rolls back
--      every statement in this file).
--   4. Production untouched (separate release gate).
--
-- What this migration does:
--   §1  replies gains a lifecycle status (active/withdrawn/cancelled).
--   §2  Partial unique index: at most ONE active volunteer offer
--       per (post, author). Historical rows are unlimited, so a
--       volunteer can always offer again — no lockout.
--   §3  notifications type CHECK extended with the 3 lifecycle types.
--   §4  queue_notification: critical delivery class for the 3
--       lifecycle types (bypasses cap / quiet hours / opt-ins /
--       master flag; block check retained; dedup NOT applied —
--       the RPCs in §5 notify only on committed state transitions,
--       which is a stronger duplicate guarantee than a time window).
--   §5  withdraw_offer / cancel_participation / helper_mark_done.
--   §6  select_helpers: post row lock + active-reply requirement.
--   §7  transition_post: post row lock.
--   §8  award_np: post row lock in the help_confirmed branch.
--   §9  Drop the raw replies update/delete RLS policies so the
--       lifecycle cannot be bypassed through the REST API.
--
-- Concurrency rule (§9.3 of the proposal): every lifecycle
-- mutation takes SELECT ... FOR UPDATE on the post row first and
-- validates against the locked state. All lifecycle operations
-- on one post are therefore serialized.
-- ============================================================

BEGIN;

-- ─── §1. Reply lifecycle status ─────────────────────────────
ALTER TABLE public.replies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'withdrawn', 'cancelled')),
  ADD COLUMN IF NOT EXISTS status_at TIMESTAMPTZ;

-- ─── §2. One active offer per volunteer per post ────────────
-- Pre-check (safeguard 1): if duplicate active volunteer offers
-- exist, fail with a precise message and change nothing. Data
-- conflicts are resolved by humans, never by this migration.
DO $$
DECLARE
  v_dupes INT;
BEGIN
  SELECT COUNT(*) INTO v_dupes FROM (
    SELECT post_id, author_id
    FROM public.replies
    WHERE kind = 'volunteer' AND status = 'active'
    GROUP BY post_id, author_id
    HAVING COUNT(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'M5 pre-check failed: % duplicate active volunteer offer pair(s) exist. Resolve them explicitly before applying M5 — this migration does not alter offer data.', v_dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS replies_one_active_offer
  ON public.replies (post_id, author_id)
  WHERE kind = 'volunteer' AND status = 'active';

-- ─── §3. Notification types ─────────────────────────────────
DO $$
DECLARE
  c TEXT;
BEGIN
  SELECT conname INTO c
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.notifications'::pg_catalog.regclass
    AND contype = 'c'
    AND pg_catalog.pg_get_constraintdef(oid) LIKE '%help_nearby%';
  IF c IS NOT NULL THEN
    EXECUTE pg_catalog.format('ALTER TABLE public.notifications DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'help_nearby', 'volunteers', 'new_message', 'help_confirmed',
    'gratitude', 'weekly_digest',
    'offer_withdrawn', 'helper_cancelled', 'helper_done'
  ));

-- ─── §4. queue_notification — critical delivery class ───────
-- Based verbatim on the M12 definition. Changes:
--   * v_critical for the 3 lifecycle types.
--   * Critical types skip: prefs/master gate, per-type opt-in,
--     dedup, frequency cap, quiet hours. Rationale (§9.2): these
--     rows are the durable in-app record of a state change on the
--     recipient's own request; suppressing them recreates silent
--     loss. The block check still applies to every type.
--   * Non-critical path is byte-for-byte the M12 behavior.
CREATE OR REPLACE FUNCTION public.queue_notification(
  p_profile_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id UUID DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefs public.notification_prefs%ROWTYPE;
  v_notif_id UUID;
  v_local_time TIME;
  v_critical BOOLEAN := p_type IN ('offer_withdrawn', 'helper_cancelled', 'helper_done');
BEGIN
  -- Block check (all types, incl. critical): never notify a user
  -- about the actions of someone blocked either way.
  IF p_actor_id IS NOT NULL AND public.is_blocked(p_profile_id, p_actor_id) THEN
    RETURN NULL;
  END IF;

  IF NOT v_critical THEN
    -- Check user preferences.
    SELECT * INTO v_prefs FROM public.notification_prefs
    WHERE profile_id = p_profile_id;

    -- Default: not opted in = no notifications.
    IF NOT FOUND OR NOT v_prefs.enabled THEN
      RETURN NULL;
    END IF;

    -- Check type-specific opt-in.
    IF (p_type = 'help_nearby' AND NOT v_prefs.notify_help_nearby)
    OR (p_type = 'volunteers' AND NOT v_prefs.notify_volunteers)
    OR (p_type = 'new_message' AND NOT v_prefs.notify_messages)
    OR (p_type = 'help_confirmed' AND NOT v_prefs.notify_confirmed)
    OR (p_type = 'weekly_digest' AND NOT v_prefs.notify_digest)
    OR (p_type = 'gratitude' AND NOT v_prefs.notify_gratitude) THEN
      RETURN NULL;
    END IF;

    -- Dedup: same type + same reference within 10 minutes.
    IF p_ref_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.notifications
      WHERE profile_id = p_profile_id
        AND type = p_type
        AND ref_id = p_ref_id
        AND created_at > pg_catalog.now() - interval '10 minutes'
    ) THEN
      RETURN NULL;
    END IF;

    -- Check frequency cap (3/day, 10/week).
    IF NOT public.can_send_notification(p_profile_id) THEN
      RETURN NULL;
    END IF;

    -- Quiet hours, evaluated in the user's own timezone.
    IF v_prefs.quiet_start IS NOT NULL AND v_prefs.quiet_end IS NOT NULL THEN
      v_local_time := (pg_catalog.now() AT TIME ZONE v_prefs.timezone)::time;
      IF v_prefs.quiet_start <= v_prefs.quiet_end THEN
        IF v_local_time >= v_prefs.quiet_start AND v_local_time < v_prefs.quiet_end THEN
          RETURN NULL;
        END IF;
      ELSE
        IF v_local_time >= v_prefs.quiet_start OR v_local_time < v_prefs.quiet_end THEN
          RETURN NULL;
        END IF;
      END IF;
    END IF;
  END IF;
  -- Critical types reach the insert unconditionally (post block
  -- check). They are emitted by the §5 RPCs ONLY on a committed
  -- state transition, and repeat calls no-op before notifying —
  -- so no dedup window is needed and no legitimate distinct
  -- event (different actor, or re-offer then withdraw again)
  -- can be suppressed.

  -- Queue the notification.
  INSERT INTO public.notifications (profile_id, type, title, body, ref_type, ref_id)
  VALUES (p_profile_id, p_type, p_title, p_body, p_ref_type, p_ref_id)
  RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC;

-- ─── §5a. withdraw_offer ────────────────────────────────────
-- Caller withdraws their own ACTIVE volunteer offer on an OPEN
-- post they are not selected for. Idempotent: withdrawing an
-- already-withdrawn offer is a successful no-op.
CREATE OR REPLACE FUNCTION public.withdraw_offer(
  p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_post public.posts%ROWTYPE;
  v_reply public.replies%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Serialize all lifecycle operations on this post.
  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  -- A selected helper must cancel, not withdraw.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(v_post.helpers, '[]'::jsonb)) AS h
    WHERE (h->>'id')::UUID = v_caller
  ) THEN
    RAISE EXCEPTION 'You are selected for this request — cancel your participation instead of withdrawing';
  END IF;

  SELECT * INTO v_reply FROM public.replies
  WHERE post_id = p_post_id AND author_id = v_caller
    AND kind = 'volunteer' AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Idempotent no-op if they already withdrew.
    IF EXISTS (
      SELECT 1 FROM public.replies
      WHERE post_id = p_post_id AND author_id = v_caller
        AND kind = 'volunteer' AND status = 'withdrawn'
    ) THEN
      RETURN pg_catalog.jsonb_build_object('result', 'already_withdrawn');
    END IF;
    RAISE EXCEPTION 'You have no active offer on this request';
  END IF;

  IF v_post.stage != 'open' THEN
    RAISE EXCEPTION 'Offers can only be withdrawn while the request is open (current: %)', v_post.stage;
  END IF;

  UPDATE public.replies
  SET status = 'withdrawn', status_at = pg_catalog.now()
  WHERE id = v_reply.id;

  -- Critical-class notice to the owner; failure-isolated.
  BEGIN
    PERFORM public.queue_notification(
      v_post.owner_id, 'offer_withdrawn',
      'A volunteer withdrew',
      'A neighbor withdrew their offer on your request.',
      'post', p_post_id, v_caller
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Notifications must never break the product action.
  END;

  RETURN pg_catalog.jsonb_build_object('result', 'withdrawn');
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_offer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_offer(UUID) TO authenticated;

-- ─── §5b. cancel_participation ──────────────────────────────
-- A SELECTED helper cancels: before work begins (open/booked)
-- or after it started (started). One transaction: helper
-- removed, their reply marked cancelled, and if they were the
-- last helper on a booked/started post the request REOPENS to
-- 'open' with an audit row naming the helper as actor.
-- A helper who marked done (done_at set) cannot cancel.
CREATE OR REPLACE FUNCTION public.cancel_participation(
  p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_post public.posts%ROWTYPE;
  v_entry JSONB;
  v_new_helpers JSONB;
  v_from_stage TEXT;
  v_reopened BOOLEAN := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  SELECT h INTO v_entry
  FROM pg_catalog.jsonb_array_elements(COALESCE(v_post.helpers, '[]'::jsonb)) AS h
  WHERE (h->>'id')::UUID = v_caller;

  IF v_entry IS NULL THEN
    -- Idempotent no-op if they already cancelled.
    IF EXISTS (
      SELECT 1 FROM public.replies
      WHERE post_id = p_post_id AND author_id = v_caller
        AND kind = 'volunteer' AND status = 'cancelled'
    ) THEN
      RETURN pg_catalog.jsonb_build_object('result', 'already_cancelled');
    END IF;
    RAISE EXCEPTION 'You are not a helper on this request';
  END IF;

  -- Marked-done lock (§9.4): completion declared = only the
  -- requester can resolve what happens next.
  IF v_entry->>'done_at' IS NOT NULL THEN
    RAISE EXCEPTION 'You have marked this help complete — only the requester can resolve it now';
  END IF;

  IF v_post.stage NOT IN ('open', 'booked', 'started') THEN
    RAISE EXCEPTION 'This help can no longer be cancelled (current stage: %)', v_post.stage;
  END IF;

  v_from_stage := v_post.stage;

  -- Remove the caller from helpers (recomputed from locked state).
  SELECT COALESCE(pg_catalog.jsonb_agg(h), '[]'::jsonb) INTO v_new_helpers
  FROM pg_catalog.jsonb_array_elements(COALESCE(v_post.helpers, '[]'::jsonb)) AS h
  WHERE (h->>'id')::UUID != v_caller;

  -- Reopen if the last helper leaves a booked/started request.
  v_reopened := (v_from_stage IN ('booked', 'started'))
    AND pg_catalog.jsonb_array_length(v_new_helpers) = 0;

  PERFORM pg_catalog.set_config('neighbloom.allow_system_field_update', 'true', true);

  IF v_reopened THEN
    UPDATE public.posts
    SET helpers = v_new_helpers, stage = 'open', status = 'open',
        updated_at = pg_catalog.now()
    WHERE id = p_post_id;
    INSERT INTO public.post_transitions (post_id, from_stage, to_stage, actor_id)
    VALUES (p_post_id, v_from_stage, 'open', v_caller);
  ELSE
    UPDATE public.posts
    SET helpers = v_new_helpers, updated_at = pg_catalog.now()
    WHERE id = p_post_id;
  END IF;

  UPDATE public.replies
  SET status = 'cancelled', status_at = pg_catalog.now()
  WHERE post_id = p_post_id AND author_id = v_caller
    AND kind = 'volunteer' AND status = 'active';

  BEGIN
    PERFORM public.queue_notification(
      v_post.owner_id, 'helper_cancelled',
      'A helper cancelled',
      CASE WHEN v_reopened
        THEN 'A helper cancelled, so your request is open again for new volunteers.'
        ELSE 'A helper cancelled their participation in your request.'
      END,
      'post', p_post_id, v_caller
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN pg_catalog.jsonb_build_object(
    'result', 'cancelled', 'reopened', v_reopened
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_participation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_participation(UUID) TO authenticated;

-- ─── §5c. helper_mark_done ──────────────────────────────────
-- Persistent completion: sets done_at on the caller's helpers
-- entry. The system of record for "the helper finished" —
-- replaces the session-only client flag. Does NOT change stage
-- (confirmation remains the owner's act). Idempotent.
CREATE OR REPLACE FUNCTION public.helper_mark_done(
  p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_post public.posts%ROWTYPE;
  v_entry JSONB;
  v_new_helpers JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  SELECT h INTO v_entry
  FROM pg_catalog.jsonb_array_elements(COALESCE(v_post.helpers, '[]'::jsonb)) AS h
  WHERE (h->>'id')::UUID = v_caller;

  IF v_entry IS NULL THEN
    RAISE EXCEPTION 'You are not a helper on this request';
  END IF;

  IF v_entry->>'done_at' IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('result', 'already_done');
  END IF;

  IF v_post.stage NOT IN ('booked', 'started') THEN
    RAISE EXCEPTION 'Completion can only be marked while the help is booked or started (current: %)', v_post.stage;
  END IF;

  SELECT pg_catalog.jsonb_agg(
    CASE WHEN (h->>'id')::UUID = v_caller
      THEN h || pg_catalog.jsonb_build_object('done_at', pg_catalog.now())
      ELSE h
    END
  ) INTO v_new_helpers
  FROM pg_catalog.jsonb_array_elements(COALESCE(v_post.helpers, '[]'::jsonb)) AS h;

  PERFORM pg_catalog.set_config('neighbloom.allow_system_field_update', 'true', true);

  UPDATE public.posts
  SET helpers = v_new_helpers, updated_at = pg_catalog.now()
  WHERE id = p_post_id;

  BEGIN
    PERFORM public.queue_notification(
      v_post.owner_id, 'helper_done',
      'Your helper finished',
      'A helper marked your request complete. You can confirm it from your post.',
      'post', p_post_id, v_caller
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN pg_catalog.jsonb_build_object('result', 'done');
END;
$$;

REVOKE ALL ON FUNCTION public.helper_mark_done(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_mark_done(UUID) TO authenticated;

-- ─── §6. select_helpers — lock + active-reply requirement ───
-- Identical to the M1 definition except: the post row is taken
-- FOR UPDATE, and a selectee must have an ACTIVE volunteer reply
-- (a withdrawn/cancelled offer can never be selected).
CREATE OR REPLACE FUNCTION public.select_helpers(
  p_post_id UUID,
  p_helper_ids UUID[]
)
RETURNS public.posts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.posts%ROWTYPE;
  v_caller UUID := auth.uid();
  v_helpers_jsonb JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_post.owner_id != v_caller THEN
    RAISE EXCEPTION 'Only the post owner can select helpers';
  END IF;

  IF v_post.stage != 'open' THEN
    RAISE EXCEPTION 'Helpers can only be selected while the post is open';
  END IF;

  IF pg_catalog.array_length(p_helper_ids, 1) IS NULL
     OR pg_catalog.array_length(p_helper_ids, 1) < 1 THEN
    RAISE EXCEPTION 'Select at least one helper';
  END IF;

  IF pg_catalog.array_length(p_helper_ids, 1) > v_post.helpers_needed THEN
    RAISE EXCEPTION 'Cannot select more helpers than requested (%)', v_post.helpers_needed;
  END IF;

  -- Every selected helper must have an ACTIVE volunteer reply.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_helper_ids) AS h(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.replies r
      WHERE r.post_id = p_post_id
        AND r.author_id = h.id
        AND r.kind = 'volunteer'
        AND r.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'All selected helpers must have an active volunteer offer';
  END IF;

  -- Owner cannot select themselves.
  IF v_caller = ANY (p_helper_ids) THEN
    RAISE EXCEPTION 'You cannot select yourself as a helper';
  END IF;

  -- Build helpers JSONB: [{id, selected_at}].
  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('id', h.id, 'selected_at', pg_catalog.now())
  ) INTO v_helpers_jsonb
  FROM pg_catalog.unnest(p_helper_ids) AS h(id);

  PERFORM pg_catalog.set_config('neighbloom.allow_system_field_update', 'true', true);

  UPDATE public.posts
  SET helpers = v_helpers_jsonb,
      updated_at = pg_catalog.now()
  WHERE id = p_post_id
  RETURNING * INTO v_post;

  RETURN v_post;
END;
$$;

-- ─── §7. transition_post — lock ─────────────────────────────
-- Identical to the M1 definition except the post row is taken
-- FOR UPDATE so owner transitions serialize with §5 operations.
CREATE OR REPLACE FUNCTION public.transition_post(
  p_post_id UUID,
  p_to_stage TEXT
)
RETURNS public.posts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.posts%ROWTYPE;
  v_caller UUID := auth.uid();
  v_helper_count INT;
  v_from_stage TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_post.owner_id != v_caller THEN
    RAISE EXCEPTION 'Only the post owner can transition lifecycle';
  END IF;

  IF NOT public.valid_transition(v_post.stage, p_to_stage) THEN
    RAISE EXCEPTION 'Invalid transition: % -> %', v_post.stage, p_to_stage;
  END IF;

  IF p_to_stage = 'booked' THEN
    SELECT pg_catalog.jsonb_array_length(v_post.helpers) INTO v_helper_count;
    IF v_helper_count IS NULL OR v_helper_count < 1 THEN
      RAISE EXCEPTION 'Cannot book: select at least one helper first';
    END IF;
  END IF;

  v_from_stage := v_post.stage;

  PERFORM pg_catalog.set_config('neighbloom.allow_system_field_update', 'true', true);

  UPDATE public.posts
  SET stage = p_to_stage,
      status = p_to_stage,
      updated_at = pg_catalog.now()
  WHERE id = p_post_id
  RETURNING * INTO v_post;

  INSERT INTO public.post_transitions (post_id, from_stage, to_stage, actor_id)
  VALUES (p_post_id, v_from_stage, p_to_stage, v_caller);

  RETURN v_post;
END;
$$;

-- ─── §8. award_np — lock the post in help_confirmed ─────────
-- Identical to the M4-era definition except the post row in the
-- 'help_confirmed' branch is taken FOR UPDATE, so a confirmation
-- racing a cancellation validates against locked state. (The
-- membership check + idempotency key already existed.)
CREATE OR REPLACE FUNCTION public.award_np(
  p_profile_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_post_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.np_ledger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_key TEXT;
  v_existing public.np_ledger%ROWTYPE;
  v_entry public.np_ledger%ROWTYPE;
  v_post public.posts%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate reason.
  IF p_reason NOT IN ('help_confirmed', 'daily_checkin', 'quick_start', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid award reason: %', p_reason;
  END IF;

  -- Validate amount is positive and sane.
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Invalid award amount: %', p_amount;
  END IF;

  -- Build idempotency key if not provided.
  v_key := COALESCE(
    p_idempotency_key,
    p_reason || ':' || p_profile_id::TEXT || ':' || pg_catalog.date_part('epoch', pg_catalog.now())::TEXT
  );

  -- Idempotency: return existing entry if this award was already processed.
  SELECT * INTO v_existing FROM public.np_ledger WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Authorization per reason:
  IF p_reason = 'help_confirmed' THEN
    -- Only the post owner can confirm, post must exist and be in 'done' stage,
    -- and the recipient must be a selected helper.
    IF p_post_id IS NULL THEN
      RAISE EXCEPTION 'post_id required for help_confirmed';
    END IF;
    SELECT * INTO v_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Post not found';
    END IF;
    IF v_post.owner_id != v_caller THEN
      RAISE EXCEPTION 'Only the post owner can confirm completion';
    END IF;
    -- Allow awards while 'done' or already 'confirmed' (multi-helper support).
    IF v_post.stage NOT IN ('done', 'confirmed') THEN
      RAISE EXCEPTION 'Post must be in done stage to confirm (current: %)', v_post.stage;
    END IF;
    -- Recipient must be a selected helper.
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_post.helpers) AS h
      WHERE (h->>'id')::UUID = p_profile_id
    ) THEN
      RAISE EXCEPTION 'NP can only be awarded to selected helpers';
    END IF;
    -- Enforce the +20 amount for help confirmations.
    IF p_amount != 20 THEN
      RAISE EXCEPTION 'help_confirmed awards exactly 20 NP';
    END IF;
    -- Auto-advance done -> confirmed on the first award only.
    IF v_post.stage = 'done' THEN
      PERFORM pg_catalog.set_config('neighbloom.allow_system_field_update', 'true', true);
      UPDATE public.posts SET stage = 'confirmed', status = 'confirmed',
        updated_at = pg_catalog.now() WHERE id = p_post_id;
      INSERT INTO public.post_transitions (post_id, from_stage, to_stage, actor_id)
      VALUES (p_post_id, 'done', 'confirmed', v_caller);
    END IF;

  ELSIF p_reason = 'daily_checkin' THEN
    -- Users can only check in for themselves.
    IF p_profile_id != v_caller THEN
      RAISE EXCEPTION 'Cannot check in for another user';
    END IF;
    IF p_amount != 5 THEN
      RAISE EXCEPTION 'daily_checkin awards exactly 5 NP';
    END IF;

  ELSIF p_reason = 'quick_start' THEN
    IF p_profile_id != v_caller THEN
      RAISE EXCEPTION 'Cannot claim quick_start for another user';
    END IF;
    IF p_amount != 25 THEN
      RAISE EXCEPTION 'quick_start awards exactly 25 NP';
    END IF;

  ELSIF p_reason = 'adjustment' THEN
    -- Reserved for admin/support. Currently no caller is authorized.
    RAISE EXCEPTION 'adjustment awards are not available';
  END IF;

  -- Apply the award with trigger bypass.
  PERFORM pg_catalog.set_config('neighbloom.allow_np_update', 'true', true);
  UPDATE public.profiles SET np = np + p_amount WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Record in ledger.
  INSERT INTO public.np_ledger (profile_id, amount, reason, post_id, idempotency_key)
  VALUES (p_profile_id, p_amount, p_reason, p_post_id, v_key)
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;

-- ─── §9. Close the raw-API bypass ───────────────────────────
-- The lifecycle is the only legitimate path for changing an
-- offer's status. Raw UPDATE/DELETE by the author would corrupt
-- it (dangling posts.helpers entries, no audit, no notices).
-- Verified before proposing: no client code updates or deletes
-- replies directly.
DROP POLICY IF EXISTS "replies_update_own" ON public.replies;
DROP POLICY IF EXISTS "replies_delete_own" ON public.replies;

COMMIT;
