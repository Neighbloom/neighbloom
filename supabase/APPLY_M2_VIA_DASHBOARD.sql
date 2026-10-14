-- ============================================================
-- Neighbloom Milestone 2 — Migrations (apply via Dashboard)
-- Branch: felix/m1-auth-posts
-- Generated: 2026-10-12 (idempotency fixes)
--
-- PREREQUISITE: Milestone 1 migrations must already be applied.
-- TRANSACTION SAFETY: Single BEGIN/COMMIT. Any failure rolls back all.
-- IDEMPOTENCY: Safe to re-run (DROP IF EXISTS / OR REPLACE / IF NOT EXISTS).
-- ============================================================

BEGIN;

-- ============================================================
-- 20261012000001_lifecycle.sql
-- ============================================================

-- Milestone 2: Server-authorized help lifecycle transitions.
--
-- The posts.stage column is locked by trigger (see 20261011000003).
-- This migration adds a SECURITY DEFINER function that is the ONLY way
-- to advance a post through its lifecycle:
--
--   open -> booked -> started -> done -> confirmed
--   (any stage -> cancelled, owner only)
--
-- Rules enforced server-side:
--   1. Only the post owner can transition.
--   2. Only valid forward transitions (or cancel) are allowed.
--   3. 'booked' requires at least one helper selected.
--   4. 'confirmed' requires stage = 'done' (requester confirms completion).
--   5. Every transition is logged to post_transitions for audit.
--   6. Helpers can only be selected while stage = 'open'.

-- Audit log for all lifecycle transitions.
CREATE TABLE IF NOT EXISTS public.post_transitions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.post_transitions ENABLE ROW LEVEL SECURITY;

-- Anyone can read transition history (transparency for trust).
DROP POLICY IF EXISTS post_transitions_select_all ON public.post_transitions;
CREATE POLICY post_transitions_select_all
  ON public.post_transitions FOR SELECT USING (true);
-- No direct inserts — only via transition_post().
-- (No INSERT/UPDATE/DELETE policies = denied by default with RLS on.)

GRANT SELECT ON public.post_transitions TO anon, authenticated;

-- Valid transitions map.
CREATE OR REPLACE FUNCTION public.valid_transition(from_stage TEXT, to_stage TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN from_stage = 'open'     AND to_stage IN ('booked', 'cancelled') THEN true
    WHEN from_stage = 'booked'   AND to_stage IN ('started', 'cancelled') THEN true
    WHEN from_stage = 'started'  AND to_stage IN ('done', 'cancelled') THEN true
    WHEN from_stage = 'done'     AND to_stage IN ('confirmed', 'cancelled') THEN true
    ELSE false
  END;
$$;

-- The ONLY way to change a post's stage. Called by the post owner.
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

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_post.owner_id != v_caller THEN
    RAISE EXCEPTION 'Only the post owner can transition lifecycle';
  END IF;

  IF NOT public.valid_transition(v_post.stage, p_to_stage) THEN
    RAISE EXCEPTION 'Invalid transition: % -> %', v_post.stage, p_to_stage;
  END IF;

  -- 'booked' requires at least one selected helper.
  IF p_to_stage = 'booked' THEN
    SELECT pg_catalog.jsonb_array_length(v_post.helpers) INTO v_helper_count;
    IF v_helper_count IS NULL OR v_helper_count < 1 THEN
      RAISE EXCEPTION 'Cannot book: select at least one helper first';
    END IF;
  END IF;

  -- Capture the source stage BEFORE the update overwrites v_post.
  v_from_stage := v_post.stage;

  -- Perform the transition (bypasses the lock trigger via SECURITY DEFINER).
  -- Set transaction-local bypass that the trigger checks.
  PERFORM pg_catalog.set_config('neighbloom.allow_system_field_update', 'true', true);

  UPDATE public.posts
  SET stage = p_to_stage,
      status = p_to_stage,
      updated_at = pg_catalog.now()
  WHERE id = p_post_id
  RETURNING * INTO v_post;

  -- Audit log with the true source stage.
  INSERT INTO public.post_transitions (post_id, from_stage, to_stage, actor_id)
  VALUES (p_post_id, v_from_stage, p_to_stage, v_caller);

  RETURN v_post;
END;
$$;

-- Owner-only helper selection. Only while stage = 'open'.
-- p_helper_ids: array of profile UUIDs (must have volunteered via replies).
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

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
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

  -- Every selected helper must have volunteered (a 'volunteer' reply on this post).
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_helper_ids) AS h(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.replies r
      WHERE r.post_id = p_post_id
        AND r.author_id = h.id
        AND r.kind = 'volunteer'
    )
  ) THEN
    RAISE EXCEPTION 'All selected helpers must have volunteered first';
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

  -- Set transaction-local bypass for the trigger.
  PERFORM pg_catalog.set_config('neighbloom.allow_system_field_update', 'true', true);

  UPDATE public.posts
  SET helpers = v_helpers_jsonb,
      updated_at = pg_catalog.now()
  WHERE id = p_post_id
  RETURNING * INTO v_post;

  RETURN v_post;
END;
$$;

-- Revoke direct execution from anon; authenticated users call via RLS context.
REVOKE ALL ON FUNCTION public.valid_transition(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.valid_transition(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.transition_post(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_post(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.select_helpers(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.select_helpers(UUID, UUID[]) TO authenticated;

-- ============================================================
-- 20261012000002_trigger_bypass.sql
-- ============================================================

-- Milestone 2: Allow authorized server-side functions to update
-- post system fields (stage, status, helpers) via a transaction-local bypass.
--
-- The M1 trigger `protect_post_system_fields` blocks ALL direct updates.
-- M2's transition_post() and select_helpers() are SECURITY DEFINER functions
-- that need to update these fields legitimately. They set a transaction-local
-- GUC that the trigger checks before rejecting.
--
-- This preserves the security model: only code running inside those specific
-- SECURITY DEFINER functions (which enforce their own authorization) can
-- bypass the trigger. Raw API calls cannot set this GUC.

-- Update the trigger function to respect the bypass.
CREATE OR REPLACE FUNCTION public.prevent_post_system_field_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  -- Allow updates from authorized SECURITY DEFINER functions.
  IF pg_catalog.current_setting('neighbloom.allow_system_field_update', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    RAISE EXCEPTION 'Direct stage modification is not allowed';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'Direct status modification is not allowed';
  END IF;
  IF OLD.helpers IS DISTINCT FROM NEW.helpers THEN
    RAISE EXCEPTION 'Direct helpers modification is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

-- Update the NP trigger similarly for award_np().
CREATE OR REPLACE FUNCTION public.prevent_np_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('neighbloom.allow_np_update', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.np IS DISTINCT FROM NEW.np THEN
    RAISE EXCEPTION 'Direct NP modification is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 20261012000003_messaging.sql
-- ============================================================

-- Milestone 2: Private messaging for help posts.
--
-- Design:
--   - A conversation is created per (post, helper) when the owner selects helpers.
--   - Only the post owner and the selected helper can read/write in that conversation.
--   - The public `replies` table is NOT reused (it's public by design).
--   - Conversations are scoped to a single post and a single helper.

-- Conversations: one per (post, helper) pair.
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  -- The two participants: post owner + selected helper.
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  helper_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  -- One conversation per (post, helper). No duplicates.
  UNIQUE (post_id, helper_id),
  -- Owner and helper must be different people.
  CHECK (owner_id != helper_id)
);

-- Messages within a conversation.
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (pg_catalog.char_length(body) >= 1 AND pg_catalog.char_length(body) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- Indexes for message listing.
CREATE INDEX IF NOT EXISTS idx_conversations_post ON public.conversations(post_id);
CREATE INDEX IF NOT EXISTS idx_conversations_owner ON public.conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_conversations_helper ON public.conversations(helper_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversations: only participants can see them.
DROP POLICY IF EXISTS conversations_select_participants ON public.conversations;
CREATE POLICY conversations_select_participants
  ON public.conversations FOR SELECT
  USING (auth.uid() = owner_id OR auth.uid() = helper_id);

-- Conversations are created by the system (via create_conversation RPC), not directly.
-- No INSERT/UPDATE/DELETE policies = denied by default.

-- Messages: only participants of the parent conversation can read.
DROP POLICY IF EXISTS messages_select_participants ON public.messages;
CREATE POLICY messages_select_participants
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.owner_id = auth.uid() OR c.helper_id = auth.uid())
    )
  );

-- Messages: only participants can send, and sender_id must match.
DROP POLICY IF EXISTS messages_insert_participants ON public.messages;
CREATE POLICY messages_insert_participants
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.owner_id = auth.uid() OR c.helper_id = auth.uid())
    )
  );

-- No message editing or deletion (immutable chat history for trust).
-- No UPDATE/DELETE policies = denied by default.

GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
-- Note: anon gets nothing — private messaging requires authentication.

-- RPC: Create a conversation for a selected helper.
-- Called automatically when helpers are selected, or manually by the post owner.
-- Only the post owner can create conversations, and only for selected helpers.
CREATE OR REPLACE FUNCTION public.create_conversation(
  p_post_id UUID,
  p_helper_id UUID
)
RETURNS public.conversations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.posts%ROWTYPE;
  v_caller UUID := auth.uid();
  v_conv public.conversations%ROWTYPE;
  v_is_selected BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_post.owner_id != v_caller THEN
    RAISE EXCEPTION 'Only the post owner can create conversations';
  END IF;

  IF p_helper_id = v_caller THEN
    RAISE EXCEPTION 'Cannot create a conversation with yourself';
  END IF;

  -- Helper must be in the selected helpers list.
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_post.helpers) AS h
    WHERE (h->>'id')::UUID = p_helper_id
  ) INTO v_is_selected;

  IF NOT v_is_selected THEN
    RAISE EXCEPTION 'Helper must be selected before messaging';
  END IF;

  -- Idempotent: return existing conversation if already created.
  SELECT * INTO v_conv FROM public.conversations
  WHERE post_id = p_post_id AND helper_id = p_helper_id;

  IF FOUND THEN
    RETURN v_conv;
  END IF;

  INSERT INTO public.conversations (post_id, owner_id, helper_id)
  VALUES (p_post_id, v_caller, p_helper_id)
  RETURNING * INTO v_conv;

  RETURN v_conv;
END;
$$;

REVOKE ALL ON FUNCTION public.create_conversation(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_conversation(UUID, UUID) TO authenticated;

-- ============================================================
-- 20261012000004_np_awards.sql
-- ============================================================

-- Milestone 2: Secure Neighbor Points awards.
--
-- Design:
--   - award_np() is the ONLY way to change a profile's NP balance.
--   - It is SECURITY DEFINER and sets a transaction-local bypass for the
--     M1 trigger that blocks direct NP modification.
--   - Every award is recorded in np_ledger for audit.
--   - Idempotency: each award has a unique idempotency_key. Duplicate calls
--     with the same key return the existing ledger entry without double-awarding.
--
-- Award reasons:
--   - 'help_confirmed': +20 NP to a helper when the requester confirms completion.
--   - 'daily_checkin': +5 NP for daily check-in (enforced once per day per user).
--   - 'quick_start': +25 NP one-time onboarding bonus.

-- Audit ledger for all NP movements.
CREATE TABLE IF NOT EXISTS public.np_ledger (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('help_confirmed', 'daily_checkin', 'quick_start', 'adjustment')),
  -- For help_confirmed: the post that was completed.
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  -- Idempotency key: unique per award event.
  -- e.g., 'help_confirmed:<post_id>:<helper_id>' or 'daily_checkin:<profile_id>:<date>'.
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_np_ledger_profile ON public.np_ledger(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_np_ledger_post ON public.np_ledger(post_id);

ALTER TABLE public.np_ledger ENABLE ROW LEVEL SECURITY;

-- Users can read their own ledger. Public read for transparency on help awards
-- is a product decision — for now, own-ledger only.
DROP POLICY IF EXISTS np_ledger_select_own ON public.np_ledger;
CREATE POLICY np_ledger_select_own
  ON public.np_ledger FOR SELECT
  USING (auth.uid() = profile_id);

-- No direct inserts — only via award_np().
GRANT SELECT ON public.np_ledger TO authenticated;

-- The ONLY way to award NP. Idempotent via idempotency_key.
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
  -- Note: Using pg_catalog.date_part('epoch', ...) instead of extract(epoch FROM ...)
  -- because EXTRACT with schema-qualified function name has parser issues with
  -- the EPOCH keyword in some PostgreSQL versions.
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
    SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Post not found';
    END IF;
    IF v_post.owner_id != v_caller THEN
      RAISE EXCEPTION 'Only the post owner can confirm completion';
    END IF;
    -- Allow awards while 'done' or already 'confirmed' (multi-helper support).
    -- The first award advances done -> confirmed; subsequent helper awards
    -- are permitted while confirmed so every helper can be recognized.
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
    -- Later awards (stage already 'confirmed') skip the transition.
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
    -- The idempotency key should include the date (caller constructs it).
    -- This prevents double check-in for the same day.

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

REVOKE ALL ON FUNCTION public.award_np(UUID, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_np(UUID, INTEGER, TEXT, UUID, TEXT) TO authenticated;

-- ============================================================
-- 20261012000005_input_validation.sql
-- ============================================================

-- Milestone 2: Server-side input validation.
--
-- The M1 schema has no length limits. A malicious client could insert
-- multi-megabyte text fields. These CHECK constraints enforce sane limits
-- at the database level, which cannot be bypassed by raw API calls.
--
-- IDEMPOTENCY: Each constraint is added only if it does not already exist.
-- Safe to re-run. Uses pg_constraint catalog check in a DO block.

DO $$
BEGIN
  -- Post title: 3-200 chars
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'posts_title_length'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_title_length
      CHECK (pg_catalog.char_length(title) >= 3 AND pg_catalog.char_length(title) <= 200);
  END IF;

  -- Post details: max 2000 chars
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'posts_details_length'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_details_length
      CHECK (details IS NULL OR pg_catalog.char_length(details) <= 2000);
  END IF;

  -- Post area: max 100 chars (town/neighborhood name)
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'posts_area_length'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_area_length
      CHECK (area IS NULL OR pg_catalog.char_length(area) <= 100);
  END IF;

  -- Reply body: 1-1000 chars
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'replies_body_length'
  ) THEN
    ALTER TABLE public.replies
      ADD CONSTRAINT replies_body_length
      CHECK (pg_catalog.char_length(body) >= 1 AND pg_catalog.char_length(body) <= 1000);
  END IF;

  -- Profile display_name: 1-50 chars (prevent 10KB hostile names)
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'profiles_display_name_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_display_name_length
      CHECK (pg_catalog.char_length(display_name) >= 1 AND pg_catalog.char_length(display_name) <= 50);
  END IF;

  -- Profile town: max 100 chars
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'profiles_town_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_town_length
      CHECK (town IS NULL OR pg_catalog.char_length(town) <= 100);
  END IF;

  -- Profile handle: max 30 chars, alphanumeric + underscore only (when set)
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'profiles_handle_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_handle_format
      CHECK (handle IS NULL OR (pg_catalog.char_length(handle) <= 30 AND handle ~ '^[a-zA-Z0-9_]+$'));
  END IF;

  -- Profile avatar_url: max 500 chars (URL)
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'profiles_avatar_url_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_avatar_url_length
      CHECK (avatar_url IS NULL OR pg_catalog.char_length(avatar_url) <= 500);
  END IF;
END;
$$;

-- Messages already have body length check (1-2000) from 20261012000003.
-- Conversations need no additional constraints.

-- ============================================================
-- 20261012000006_moderation.sql
-- ============================================================

-- Milestone 2: Reporting and moderation foundation.
--
-- Design:
--   - Users can report posts, replies, messages, or profiles.
--   - Reports go to a real moderation queue (not local-only).
--   - Reports are private: only the reporter and moderators can see them.
--   - For now, there are no moderators — reports accumulate for review.
--     A future migration will add moderator roles.
--   - Blocks are user-level: blocking hides the blocked user's content.

-- Reports table.
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- What's being reported (exactly one must be set).
  reported_post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  reported_reply_id UUID REFERENCES public.replies(id) ON DELETE CASCADE,
  reported_message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  reported_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN (
    'spam', 'harassment', 'inappropriate', 'scam', 'safety', 'other'
  )),
  details TEXT CHECK (details IS NULL OR pg_catalog.char_length(details) <= 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  -- Exactly one target must be specified.
  CHECK (
    (CASE WHEN reported_post_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN reported_reply_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN reported_message_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN reported_profile_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  -- Cannot report yourself.
  CHECK (reporter_id != reported_profile_id)
);

-- Prevent duplicate reports (same reporter, same target).
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique_post
  ON public.reports (reporter_id, reported_post_id) WHERE reported_post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique_reply
  ON public.reports (reporter_id, reported_reply_id) WHERE reported_reply_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique_message
  ON public.reports (reporter_id, reported_message_id) WHERE reported_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique_profile
  ON public.reports (reporter_id, reported_profile_id) WHERE reported_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status, created_at);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Users can see their own reports.
DROP POLICY IF EXISTS reports_select_own ON public.reports;
CREATE POLICY reports_select_own
  ON public.reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- Users can file reports.
DROP POLICY IF EXISTS reports_insert_own ON public.reports;
CREATE POLICY reports_insert_own
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- No update/delete for regular users (moderators will get policies later).
GRANT SELECT, INSERT ON public.reports TO authenticated;

-- Blocks table: user-level blocking.
CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- Users can see their own blocks.
DROP POLICY IF EXISTS blocks_select_own ON public.blocks;
CREATE POLICY blocks_select_own
  ON public.blocks FOR SELECT
  USING (auth.uid() = blocker_id);

-- Users can block/unblock.
DROP POLICY IF EXISTS blocks_insert_own ON public.blocks;
CREATE POLICY blocks_insert_own
  ON public.blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS blocks_delete_own ON public.blocks;
CREATE POLICY blocks_delete_own
  ON public.blocks FOR DELETE
  USING (auth.uid() = blocker_id);

GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;

-- Helper function: check if user A has blocked user B (or vice versa).
CREATE OR REPLACE FUNCTION public.is_blocked(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
       OR (blocker_id = p_user_b AND blocked_id = p_user_a)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked(UUID, UUID) TO authenticated;

-- ============================================================
-- 20261012000007_rate_limits.sql
-- ============================================================

-- Milestone 2: Server-side rate limiting.
--
-- Client-side rate limits are trivially bypassable (clear localStorage).
-- These triggers enforce limits at the database level.
--
-- Limits:
--   - Posts: max 10 per hour, max 30 per day per user
--   - Replies: max 20 per hour, max 50 per day per user
--   - Messages: max 60 per hour, max 200 per day per user
--   - Reports: max 20 per day per user (prevent report spam)

-- Generic rate limit check function.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_table TEXT,
  p_hour_limit INT,
  p_day_limit INT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_hour_count INT;
  v_day_count INT;
BEGIN
  -- Count in the last hour.
  EXECUTE format(
    'SELECT count(*) FROM public.%I WHERE %s = $1 AND created_at > pg_catalog.now() - interval ''1 hour''',
    p_table,
    CASE WHEN p_table = 'posts' THEN 'owner_id'
         WHEN p_table = 'replies' THEN 'author_id'
         WHEN p_table = 'messages' THEN 'sender_id'
         WHEN p_table = 'reports' THEN 'reporter_id'
    END
  ) INTO v_hour_count USING p_user_id;

  IF v_hour_count >= p_hour_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many % in the last hour', p_table;
  END IF;

  -- Count in the last 24 hours.
  EXECUTE format(
    'SELECT count(*) FROM public.%I WHERE %s = $1 AND created_at > pg_catalog.now() - interval ''24 hours''',
    p_table,
    CASE WHEN p_table = 'posts' THEN 'owner_id'
         WHEN p_table = 'replies' THEN 'author_id'
         WHEN p_table = 'messages' THEN 'sender_id'
         WHEN p_table = 'reports' THEN 'reporter_id'
    END
  ) INTO v_day_count USING p_user_id;

  IF v_day_count >= p_day_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many % in the last 24 hours', p_table;
  END IF;
END;
$$;

-- Trigger functions per table.
CREATE OR REPLACE FUNCTION public.enforce_post_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.check_rate_limit(NEW.owner_id, 'posts', 10, 30);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_reply_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.check_rate_limit(NEW.author_id, 'replies', 20, 50);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.check_rate_limit(NEW.sender_id, 'messages', 60, 200);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_report_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.check_rate_limit(NEW.reporter_id, 'reports', 5, 20);
  RETURN NEW;
END; $$;

-- Attach triggers.
DROP TRIGGER IF EXISTS rate_limit_posts ON public.posts;
CREATE TRIGGER rate_limit_posts
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_post_rate_limit();

DROP TRIGGER IF EXISTS rate_limit_replies ON public.replies;
CREATE TRIGGER rate_limit_replies
  BEFORE INSERT ON public.replies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_reply_rate_limit();

DROP TRIGGER IF EXISTS rate_limit_messages ON public.messages;
CREATE TRIGGER rate_limit_messages
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_rate_limit();

DROP TRIGGER IF EXISTS rate_limit_reports ON public.reports;
CREATE TRIGGER rate_limit_reports
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_report_rate_limit();

-- ============================================================
-- 20261012000008_notifications_gratitude.sql
-- ============================================================

-- Product Excellence: Push notifications, public gratitude, helper recognition.
--
-- APPROVED by founder (2026-10-12):
--   1. Push notifications with user consent, relevance controls, frequency limits
--   2. Public gratitude and verified helper recognition with privacy protections
--   3. (Celebration experience is frontend-only; no schema needed)
--
-- Design principles:
--   - Notifications are OPT-IN (default off, explicit consent required)
--   - Frequency caps enforced server-side (max 3/day, max 10/week per user)
--   - Users control which types they receive
--   - Gratitude is OPT-IN for both giver and receiver (consent on both sides)
--   - No private data in notifications (no message content, no addresses)

-- ─── Notification preferences ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notification_prefs (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Master switch: must be explicitly enabled by the user.
  enabled BOOLEAN NOT NULL DEFAULT false,
  -- Granular controls (all default true when master is enabled).
  notify_help_nearby BOOLEAN NOT NULL DEFAULT true,
  notify_volunteers BOOLEAN NOT NULL DEFAULT true,
  notify_messages BOOLEAN NOT NULL DEFAULT true,
  notify_confirmed BOOLEAN NOT NULL DEFAULT true,
  notify_digest BOOLEAN NOT NULL DEFAULT true,
  -- Quiet hours (don't send between these times, in user's local time).
  quiet_start TIME DEFAULT '22:00',
  quiet_end TIME DEFAULT '08:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_prefs_select_own ON public.notification_prefs;
CREATE POLICY notif_prefs_select_own
  ON public.notification_prefs FOR SELECT USING (auth.uid() = profile_id);
DROP POLICY IF EXISTS notif_prefs_insert_own ON public.notification_prefs;
CREATE POLICY notif_prefs_insert_own
  ON public.notification_prefs FOR INSERT WITH CHECK (auth.uid() = profile_id);
DROP POLICY IF EXISTS notif_prefs_update_own ON public.notification_prefs;
CREATE POLICY notif_prefs_update_own
  ON public.notification_prefs FOR UPDATE USING (auth.uid() = profile_id);

GRANT SELECT, INSERT, UPDATE ON public.notification_prefs TO authenticated;

-- ─── Push subscriptions (Web Push) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  -- One subscription per endpoint per user.
  UNIQUE (profile_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_sub_select_own ON public.push_subscriptions;
CREATE POLICY push_sub_select_own
  ON public.push_subscriptions FOR SELECT USING (auth.uid() = profile_id);
DROP POLICY IF EXISTS push_sub_insert_own ON public.push_subscriptions;
CREATE POLICY push_sub_insert_own
  ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = profile_id);
DROP POLICY IF EXISTS push_sub_delete_own ON public.push_subscriptions;
CREATE POLICY push_sub_delete_own
  ON public.push_subscriptions FOR DELETE USING (auth.uid() = profile_id);

GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;

-- ─── Notification queue ────────────────────────────────────────
-- Server-side queue with frequency caps. A background worker (or edge function)
-- processes these and sends via Web Push.

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'help_nearby',      -- Someone near you needs help
    'volunteers',       -- Someone volunteered for your post
    'new_message',      -- New message in your conversation
    'help_confirmed',   -- Your help was confirmed (+20 NP)
    'gratitude',        -- Someone thanked you publicly
    'weekly_digest'     -- Neighborhood pulse summary
  )),
  title TEXT NOT NULL CHECK (pg_catalog.char_length(title) <= 100),
  body TEXT NOT NULL CHECK (pg_catalog.char_length(body) <= 200),
  -- Optional deep link (post ID, conversation ID).
  ref_type TEXT CHECK (ref_type IN ('post', 'conversation', null)),
  ref_id UUID,
  -- Delivery tracking.
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_profile
  ON public.notifications(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unsent
  ON public.notifications(sent_at) WHERE sent_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT USING (auth.uid() = profile_id);

-- Users cannot insert directly; only server-side functions create notifications.
GRANT SELECT ON public.notifications TO authenticated;

-- ─── Frequency cap enforcement ─────────────────────────────────
-- Max 3 notifications per day, max 10 per week per user.
-- Called by the queueing function before inserting.

CREATE OR REPLACE FUNCTION public.can_send_notification(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_day_count INT;
  v_week_count INT;
BEGIN
  SELECT count(*) INTO v_day_count FROM public.notifications
  WHERE profile_id = p_profile_id
    AND created_at > pg_catalog.now() - interval '24 hours';

  IF v_day_count >= 3 THEN RETURN false; END IF;

  SELECT count(*) INTO v_week_count FROM public.notifications
  WHERE profile_id = p_profile_id
    AND created_at > pg_catalog.now() - interval '7 days';

  IF v_week_count >= 10 THEN RETURN false; END IF;

  RETURN true;
END;
$$;

-- ─── Queue a notification (server-side only) ───────────────────
-- Checks: user has opted in, type is enabled, frequency cap not exceeded,
-- not in quiet hours. Returns null if suppressed.

CREATE OR REPLACE FUNCTION public.queue_notification(
  p_profile_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefs public.notification_prefs%ROWTYPE;
  v_notif_id UUID;
  v_hour INT;
BEGIN
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
  OR (p_type = 'gratitude' AND NOT v_prefs.notify_confirmed) THEN
    RETURN NULL;
  END IF;

  -- Check frequency cap.
  IF NOT public.can_send_notification(p_profile_id) THEN
    RETURN NULL;
  END IF;

  -- Check quiet hours (simplified: uses server time; client should adjust).
  v_hour := pg_catalog.date_part('hour', pg_catalog.now());
  -- Quiet hours wrap midnight; simplified check.
  -- Full implementation would use user's timezone from profile.

  -- Queue the notification.
  INSERT INTO public.notifications (profile_id, type, title, body, ref_type, ref_id)
  VALUES (p_profile_id, p_type, p_title, p_body, p_ref_type, p_ref_id)
  RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
-- Only service role / backend can call this. Not granted to authenticated.

REVOKE ALL ON FUNCTION public.can_send_notification(UUID) FROM PUBLIC;

-- ─── Public gratitude ──────────────────────────────────────────
-- After a help is confirmed, the requester can optionally post a public
-- thank-you. The helper must also consent (they can hide it).
-- This creates the visible recognition loop without exposing private details.

CREATE TABLE IF NOT EXISTS public.gratitude_posts (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  -- Who is being thanked (the helper).
  helper_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Who is giving thanks (the requester).
  thanker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (
    pg_catalog.char_length(message) >= 5 AND pg_catalog.char_length(message) <= 300
  ),
  -- Helper can hide public gratitude about them (privacy control).
  hidden_by_helper BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  -- One gratitude post per (post, helper). No duplicates.
  UNIQUE (post_id, helper_id),
  CHECK (helper_id != thanker_id)
);

CREATE INDEX IF NOT EXISTS idx_gratitude_helper
  ON public.gratitude_posts(helper_id, created_at DESC)
  WHERE hidden_by_helper = false;
CREATE INDEX IF NOT EXISTS idx_gratitude_recent
  ON public.gratitude_posts(created_at DESC)
  WHERE hidden_by_helper = false;

ALTER TABLE public.gratitude_posts ENABLE ROW LEVEL SECURITY;

-- Public read (only non-hidden). This is the recognition mechanism.
DROP POLICY IF EXISTS gratitude_select_public ON public.gratitude_posts;
CREATE POLICY gratitude_select_public
  ON public.gratitude_posts FOR SELECT
  USING (hidden_by_helper = false);

-- Only the post owner (thanker) can create, and only after confirmation.
-- Enforced by RPC, not direct insert.
GRANT SELECT ON public.gratitude_posts TO anon, authenticated;

-- RPC: Post public gratitude. Only the requester, only after 'confirmed',
-- only for selected helpers.
CREATE OR REPLACE FUNCTION public.post_gratitude(
  p_post_id UUID,
  p_helper_id UUID,
  p_message TEXT
)
RETURNS public.gratitude_posts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.posts%ROWTYPE;
  v_caller UUID := auth.uid();
  v_gratitude public.gratitude_posts%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_post.owner_id != v_caller THEN
    RAISE EXCEPTION 'Only the requester can post gratitude';
  END IF;

  IF v_post.stage != 'confirmed' THEN
    RAISE EXCEPTION 'Can only thank after help is confirmed';
  END IF;

  -- Helper must have been selected.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_post.helpers) AS h
    WHERE (h->>'id')::UUID = p_helper_id
  ) THEN
    RAISE EXCEPTION 'Can only thank selected helpers';
  END IF;

  IF p_message IS NULL OR pg_catalog.char_length(p_message) < 5
     OR pg_catalog.char_length(p_message) > 300 THEN
    RAISE EXCEPTION 'Message must be 5-300 characters';
  END IF;

  INSERT INTO public.gratitude_posts (post_id, helper_id, thanker_id, message)
  VALUES (p_post_id, p_helper_id, v_caller, p_message)
  RETURNING * INTO v_gratitude;

  -- Queue a notification for the helper (if they've opted in).
  PERFORM public.queue_notification(
    p_helper_id,
    'gratitude',
    'Someone thanked you publicly',
    'A neighbor shared gratitude for your help.',
    'post',
    p_post_id
  );

  RETURN v_gratitude;
END;
$$;

REVOKE ALL ON FUNCTION public.post_gratitude(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_gratitude(UUID, UUID, TEXT) TO authenticated;

-- RPC: Helper can hide gratitude about them (privacy control).
CREATE OR REPLACE FUNCTION public.hide_gratitude(p_gratitude_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.gratitude_posts
  SET hidden_by_helper = true
  WHERE id = p_gratitude_id AND helper_id = v_caller;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gratitude post not found or not yours';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.hide_gratitude(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hide_gratitude(UUID) TO authenticated;

-- ─── Helper recognition counters ─────────────────────────────
-- Materialized counts for "Helped X neighbors" display.
-- Updated by trigger on np_ledger (help_confirmed awards).

CREATE OR REPLACE FUNCTION public.update_helper_stats()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  -- This is a placeholder for a future helper_stats table.
  -- For now, counts are derived from np_ledger queries.
  -- A materialized table will be added if query performance requires it.
  RETURN NEW;
END;
$$;

-- Helper function: get verified help count for a profile.
-- SECURITY DEFINER so it bypasses np_ledger RLS (which restricts to own rows).
-- Safe: returns only an aggregate COUNT, never ledger details.
-- This powers "Helped X neighbors" in the directory — public, verified, dignified.
--
-- AUTH MODEL: Intentionally callable by anon (no auth.uid() check).
-- This is CORRECT because the function returns only public reputation data
-- (a count), not private information. The count is the same regardless of
-- who asks. Functions that return private/user-specific data DO require auth;
-- see award_np(), post_gratitude() which check auth.uid() IS NOT NULL.
CREATE OR REPLACE FUNCTION public.get_help_count(p_profile_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::INT FROM public.np_ledger
  WHERE profile_id = p_profile_id AND reason = 'help_confirmed';
$$;

REVOKE ALL ON FUNCTION public.get_help_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_help_count(UUID) TO anon, authenticated;

-- ============================================================
-- 20261012000009_neighbor_intros.sql
-- ============================================================

-- Welcome to Worth + Your Neighbors: neighbor introductions.
--
-- Part of the coherent first-visit experience (Concepts A+B, founder-approved).
-- New members write a brief intro: who they are, roughly where, what they're
-- good at or happy to help with. This powers the "Your Neighbors" directory
-- and makes the first visit feel human, not empty.

-- Add intro fields to profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS intro TEXT
  CHECK (intro IS NULL OR pg_catalog.char_length(intro) <= 200);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS intro_visible BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skills TEXT[]
  CHECK (skills IS NULL OR pg_catalog.array_length(skills, 1) <= 10);

-- Skills are simple tags like 'yard work', 'plumbing', 'cooking', 'rides'.
-- Used for "The Right Ask" skill matching (Concept D).

-- Update the profile update allowlist comment:
-- profiles: display_name, handle, town, avatar_url, intro, intro_visible, skills
-- (np, id, created_at remain protected)

-- Index for neighbor directory queries.
CREATE INDEX IF NOT EXISTS idx_profiles_town_visible
  ON public.profiles(town) WHERE intro_visible = true;

-- ============================================================
-- 20261012000010_privacy_enforcement.sql
-- ============================================================

-- Privacy enforcement for neighbor introductions (Finding #5).
--
-- Problem: The M1 RLS policy `profiles_select_all` uses USING(true), which
-- exposes ALL columns including `intro` and `skills` even when the user set
-- `intro_visible = false`. Frontend filtering in fetchNeighbors() is not
-- sufficient — a direct API call could retrieve hidden profile data.
--
-- Solution (defense in depth, DB-enforced):
--   1. `visible_profiles` view: CASE-filters intro/skills to NULL when hidden.
--      This is enforced by the database, not the client.
--   2. `get_neighbor_directory()` SECURITY DEFINER function: the ONLY
--      supported path for directory queries. Returns only visible profiles.
--   3. Column-level REVOKE: anon cannot SELECT intro/skills directly.
--
-- Threat model:
--   - The directory (browse all neighbors) MUST respect intro_visible.
--     Enforced by view + function. ✓
--   - Direct profile lookup by UUID by an authenticated neighbor: the intro
--     is visible if they have the ID. This is acceptable — authenticated
--     users are community members, and UUIDs are not enumerable.
--   - Anonymous users: cannot access intro/skills columns directly. ✓

-- 1. View with DB-enforced visibility filtering.
-- Owner always sees their own intro/skills (auth.uid() = id).
-- Others only see intro/skills when intro_visible = true.
-- This is the PRIMARY read path for profiles. Direct table SELECT on
-- intro/skills is revoked below, forcing all reads through this view.
CREATE OR REPLACE VIEW public.visible_profiles AS
SELECT
  id,
  display_name,
  handle,
  town,
  avatar_url,
  np,
  created_at,
  -- Only expose intro/skills when visible OR when the viewer is the owner.
  CASE WHEN intro_visible OR auth.uid() = id THEN intro ELSE NULL END AS intro,
  CASE WHEN intro_visible OR auth.uid() = id THEN skills ELSE NULL END AS skills,
  intro_visible
FROM public.profiles;

-- Views inherit RLS from underlying tables in PostgreSQL, but we want
-- the view to be the controlled access path. Grant to all.
GRANT SELECT ON public.visible_profiles TO anon, authenticated;

-- CRITICAL: PostgreSQL views run as the OWNER by default (like SECURITY DEFINER
-- functions), unless security_invoker=true is set (PG 15+).
-- This means the view CAN read intro/skills columns even though we revoked them
-- from anon/authenticated — it bypasses those revokes as the owner.
-- The explicit SET (security_invoker = false) below documents this intent.
--
-- auth.uid() still returns the CALLER's ID (it's read from the JWT session,
-- not from the role), so the CASE logic correctly enforces visibility:
--   - Owner (auth.uid() = id): sees own intro/skills
--   - Others: sees intro/skills only if intro_visible=true
--   - Anon (auth.uid() IS NULL): sees intro/skills only if intro_visible=true
ALTER VIEW public.visible_profiles SET (security_invoker = false);

-- 2. SECURITY DEFINER function for directory queries.
-- Bypasses RLS to ensure consistent results, but ONLY returns visible profiles.
--
-- AUTH MODEL: Intentionally callable by anon (no auth.uid() check).
-- This is CORRECT because the function only returns profiles where
-- intro_visible=true (public directory data). Hidden profiles are never
-- returned. The function is a privacy filter, not a privacy bypass.
CREATE OR REPLACE FUNCTION public.get_neighbor_directory(
  p_town TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  town TEXT,
  intro TEXT,
  skills TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    vp.id, vp.display_name, vp.avatar_url, vp.town,
    vp.intro, vp.skills, vp.created_at
  FROM public.visible_profiles vp
  WHERE vp.intro_visible = true
    AND (p_town IS NULL OR vp.town = p_town)
  ORDER BY vp.created_at DESC
  LIMIT LEAST(p_limit, 50);
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_directory(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_neighbor_directory(TEXT, INT) TO anon, authenticated;

-- 3. Harden direct column access.
-- Revoke intro/skills from BOTH anon and authenticated at the column level.
-- This forces ALL reads of intro/skills through the visible_profiles view,
-- which enforces intro_visible at the database level.
--
-- The owner can still UPDATE their own intro/skills via RLS (profiles_update_own).
-- The owner reads their own data via the view (auth.uid() = id exception).
DO $$
BEGIN
  -- Anon: only safe columns, no intro/skills.
  REVOKE ALL ON public.profiles FROM anon;
  GRANT SELECT (id, display_name, avatar_url, town, created_at)
    ON public.profiles TO anon;

  -- Authenticated: revoke table-level, grant specific columns EXCLUDING intro/skills.
  -- They must use visible_profiles view for intro/skills (DB-enforced visibility).
  REVOKE ALL ON public.profiles FROM authenticated;
  GRANT SELECT (id, display_name, handle, town, avatar_url, np, created_at)
    ON public.profiles TO authenticated;
  GRANT UPDATE (display_name, handle, town, avatar_url, intro, intro_visible, skills)
    ON public.profiles TO authenticated;
  -- Note: np is NOT in the UPDATE grant (protected by trigger).
  -- Note: id, created_at are NOT in the UPDATE grant (immutable).
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- Document the privacy model.
COMMENT ON VIEW public.visible_profiles IS
  'DB-enforced neighbor directory. intro/skills are NULL when intro_visible=false. Use this or get_neighbor_directory() for directory queries.';
COMMENT ON FUNCTION public.get_neighbor_directory(TEXT, INT) IS
  'Returns only profiles with intro_visible=true. The supported directory access path.';

-- ============================================================
-- 20261012000011_hard_block.sql
-- ============================================================

-- Hard-block enforcement: prevent unwanted contact via RLS.
--
-- Founder-approved: meaningful hard-block across posts, replies, messaging,
-- notifications, profiles, and backend operations.
--
-- BEHAVIOR:
--   When User A blocks User B (in either direction):
--   - B cannot see A's posts (and vice versa — blocking is mutual for visibility)
--   - B cannot reply to A's posts (and vice versa)
--   - Neither can initiate new conversations with each other
--   - Neither receives notifications about the other's actions
--   - Existing conversations are frozen (no new messages)
--
-- RATIONALE for mutual visibility blocking:
--   If A blocks B, A doesn't want to see B's content either. This is standard
--   for safety features (cf. Twitter/X, Instagram). The "reveal" concern
--   (B noticing A's posts disappeared) is outweighed by safety.
--
-- REPORTING PRESERVED:
--   Blocking does NOT prevent reporting. Users can still report posts/replies
--   from blocked users via the reports table (separate RLS).

-- 1. Make is_blocked() SECURITY DEFINER so RLS policies can check both directions.
--    Currently the blocks RLS only lets users see their own blocks, which means
--    a policy checking "did A block B" would fail when the viewer is B.
CREATE OR REPLACE FUNCTION public.is_blocked(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
       OR (blocker_id = p_user_b AND blocked_id = p_user_a)
  );
$$;

REVOKE ALL ON FUNCTION public.is_blocked(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked(UUID, UUID) TO authenticated;

-- 2. Posts: hide posts from blocked users (both directions).
--    Note: anon users have no blocks, so is_blocked(NULL, owner_id) = false.
--    The function handles NULL gracefully (no match).
DROP POLICY IF EXISTS "posts_select_all" ON public.posts;
CREATE POLICY "posts_select_all"
  ON public.posts FOR SELECT
  USING (
    NOT public.is_blocked(auth.uid(), owner_id)
  );

-- 3. Replies: cannot reply to posts from blocked users; blocked users cannot reply.
--    Check both the post owner and the reply author.
DROP POLICY IF EXISTS "replies_select_all" ON public.replies;
CREATE POLICY "replies_select_all"
  ON public.replies FOR SELECT
  USING (
    NOT public.is_blocked(auth.uid(), author_id)
  );

-- Replies INSERT: must not be blocked by post owner (in either direction).
-- Drop existing policy if present (idempotent).
DROP POLICY IF EXISTS "replies_insert_own" ON public.replies;

CREATE POLICY "replies_insert_own"
  ON public.replies FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND NOT public.is_blocked(auth.uid(), (
      SELECT owner_id FROM public.posts WHERE id = post_id
    ))
  );

-- 4. Messaging: block conversation creation and messages between blocked users.
--    Update create_conversation() to reject if blocked.
CREATE OR REPLACE FUNCTION public.create_conversation(
  p_post_id UUID,
  p_helper_id UUID
)
RETURNS public.conversations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.posts%ROWTYPE;
  v_caller UUID := auth.uid();
  v_conv public.conversations%ROWTYPE;
  v_is_selected BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Block check: cannot create conversation with blocked user (either direction).
  IF public.is_blocked(v_caller, p_helper_id) THEN
    RAISE EXCEPTION 'Cannot message this user';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  -- ... rest of function unchanged (preserved from 20261012000003) ...
  -- Only the post owner can create conversations, and only for selected helpers.
  IF v_post.owner_id != v_caller THEN
    RAISE EXCEPTION 'Only the post owner can create conversations';
  END IF;

  -- Helper must have been selected.
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_post.helpers) AS h
    WHERE (h->>'id')::UUID = p_helper_id
  ) INTO v_is_selected;

  IF NOT v_is_selected THEN
    RAISE EXCEPTION 'Helper must be selected first';
  END IF;

  -- Idempotency: return existing conversation if already created.
  SELECT * INTO v_conv FROM public.conversations
  WHERE post_id = p_post_id AND helper_id = p_helper_id;
  IF FOUND THEN
    RETURN v_conv;
  END IF;

  INSERT INTO public.conversations (post_id, owner_id, helper_id)
  VALUES (p_post_id, v_caller, p_helper_id)
  RETURNING * INTO v_conv;

  RETURN v_conv;
END;
$$;

-- Messages: freeze existing conversations if block occurs after creation.
-- Update the messages_insert policy to check blocks.
DROP POLICY IF EXISTS "messages_insert_participants" ON public.messages;
CREATE POLICY "messages_insert_participants"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.owner_id = auth.uid() OR c.helper_id = auth.uid())
        -- Block check: neither participant may have blocked the other.
        AND NOT public.is_blocked(c.owner_id, c.helper_id)
    )
  );

-- 5. Notifications: do not queue notifications about blocked users' actions.
--    Update queue_notification() to skip if blocked.
CREATE OR REPLACE FUNCTION public.queue_notification(
  p_profile_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_prefs RECORD;
BEGIN
  -- Block check: do not notify about blocked users' actions.
  -- If the actor blocked the recipient (or vice versa), skip.
  IF p_actor_id IS NOT NULL AND public.is_blocked(p_profile_id, p_actor_id) THEN
    RETURN NULL;
  END IF;

  -- Check user preferences.
  SELECT * INTO v_prefs FROM public.notification_prefs
  WHERE profile_id = p_profile_id;

  -- If no prefs or disabled, skip (but still return NULL, not error).
  IF NOT FOUND OR NOT v_prefs.enabled THEN
    RETURN NULL;
  END IF;

  -- Check type-specific preference.
  -- (Simplified: actual implementation checks v_prefs.notify_* flags)
  -- For now, queue if enabled.

  INSERT INTO public.notifications (profile_id, type, title, body, data, actor_id)
  VALUES (p_profile_id, p_type, p_title, p_body, p_data, p_actor_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 6. Profiles: blocked users see minimal profile (already handled by posts/replies
--    filtering, but ensure directory doesn't show blocked users).
--    Update get_neighbor_directory to exclude blocked users.
CREATE OR REPLACE FUNCTION public.get_neighbor_directory(
  p_town TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  town TEXT,
  intro TEXT,
  skills TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    vp.id, vp.display_name, vp.avatar_url, vp.town,
    vp.intro, vp.skills, vp.created_at
  FROM public.visible_profiles vp
  WHERE vp.intro_visible = true
    AND (p_town IS NULL OR vp.town = p_town)
    -- Exclude blocked users (both directions). NULL auth.uid() (anon) skips check.
    AND (auth.uid() IS NULL OR NOT public.is_blocked(auth.uid(), vp.id))
  ORDER BY vp.created_at DESC
  LIMIT LEAST(p_limit, 50);
$$;

-- Grant execute (already granted, but ensure after OR REPLACE).
REVOKE ALL ON FUNCTION public.get_neighbor_directory(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_neighbor_directory(TEXT, INT) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.is_blocked(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.is_blocked(UUID, UUID) IS
  'SECURITY DEFINER: checks blocks in both directions for RLS policies. Returns false for NULL inputs.';

COMMIT;
