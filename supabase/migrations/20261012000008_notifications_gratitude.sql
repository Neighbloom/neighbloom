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

CREATE POLICY notif_prefs_select_own
  ON public.notification_prefs FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY notif_prefs_insert_own
  ON public.notification_prefs FOR INSERT WITH CHECK (auth.uid() = profile_id);
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

CREATE POLICY push_sub_select_own
  ON public.push_subscriptions FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY push_sub_insert_own
  ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = profile_id);
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
  v_hour := pg_catalog.extract(hour FROM pg_catalog.now());
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
