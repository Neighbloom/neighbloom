-- ============================================================
-- Migration: 20261012000012_notification_wiring.sql
-- Neighbloom M3: wire notification events + complete queue_notification
--
-- PROBLEM (found in real dev integration testing, 2026-10-12):
--   queue_notification() existed with zero callers — no trigger,
--   function, or app path ever created a notification. Its quiet-hours
--   check was also a stub (computed the hour, never compared it),
--   and it had no deduplication.
--
-- THIS MIGRATION:
--   1. Adds notification_prefs.timezone (default 'America/Chicago',
--      the pilot town's zone) and a dedicated notify_gratitude toggle.
--   2. Replaces queue_notification() with a completed version:
--      opt-in check, per-type toggles, dedup (same type+ref within
--      10 minutes suppressed), frequency caps (existing 3/day, 10/week),
--      and REAL quiet hours evaluated in the user's timezone.
--      Quiet hours SUPPRESS creation for every type: the bell is a
--      nudge layer, not the record — the underlying post/message/NP
--      is still in the app when the user returns.
--   3. Wires the five product events via AFTER INSERT triggers.
--      Every trigger function is SECURITY DEFINER and wraps the queue
--      call in an exception handler: a notification failure can NEVER
--      break posting, messaging, volunteering, or NP awards.
--   4. No private data in notifications: no message bodies, no
--      addresses — just the event and a reference id.
--
-- Fully idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS +
-- ADD COLUMN IF NOT EXISTS throughout. Safe to rerun.
-- ============================================================

-- ─── 1. Prefs: timezone + gratitude toggle ────────────────────

ALTER TABLE public.notification_prefs
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago';

ALTER TABLE public.notification_prefs
  ADD COLUMN IF NOT EXISTS notify_gratitude BOOLEAN NOT NULL DEFAULT true;

-- ─── 2. Completed queue_notification ──────────────────────────
-- Same signature as migration 20261012000008 so nothing else changes.
-- Still callable only by service_role / SECURITY DEFINER contexts
-- (EXECUTE remains revoked from PUBLIC and ungranted to clients).

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
  v_local_time TIME;
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
  OR (p_type = 'gratitude' AND NOT v_prefs.notify_gratitude) THEN
    RETURN NULL;
  END IF;

  -- Dedup: same type + same reference for this user within 10 minutes
  -- is a burst or a retry — suppress it. (For new_message the ref is
  -- the conversation, so a rapid back-and-forth yields one nudge.)
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
  -- Handles windows that wrap midnight (e.g. 22:00–08:00).
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

  -- Queue the notification.
  INSERT INTO public.notifications (profile_id, type, title, body, ref_type, ref_id)
  VALUES (p_profile_id, p_type, p_title, p_body, p_ref_type, p_ref_id)
  RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;

-- ─── 3. Event triggers ────────────────────────────────────────

-- 3a. Someone volunteers → notify the post owner.
CREATE OR REPLACE FUNCTION public.notify_on_volunteer()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT owner_id INTO v_owner FROM public.posts WHERE id = NEW.post_id;
  IF v_owner IS NOT NULL AND v_owner <> NEW.author_id THEN
    BEGIN
      PERFORM public.queue_notification(
        v_owner, 'volunteers',
        'Someone volunteered',
        'A neighbor offered to help with your request.',
        'post', NEW.post_id
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Notifications must never break the product action.
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_volunteer ON public.replies;
CREATE TRIGGER trg_notify_volunteer
  AFTER INSERT ON public.replies
  FOR EACH ROW WHEN (NEW.kind = 'volunteer')
  EXECUTE FUNCTION public.notify_on_volunteer();

-- 3b. New message → notify the other participant.
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner UUID;
  v_helper UUID;
  v_recipient UUID;
BEGIN
  SELECT owner_id, helper_id INTO v_owner, v_helper
  FROM public.conversations WHERE id = NEW.conversation_id;

  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  v_recipient := CASE WHEN NEW.sender_id = v_owner THEN v_helper ELSE v_owner END;

  IF v_recipient IS NOT NULL
     AND v_recipient <> NEW.sender_id
     AND NOT public.is_blocked(NEW.sender_id, v_recipient) THEN
    BEGIN
      PERFORM public.queue_notification(
        v_recipient, 'new_message',
        'New message',
        'You have a new message in your conversation.',
        'conversation', NEW.conversation_id
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_message ON public.messages;
CREATE TRIGGER trg_notify_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_message();

-- 3c. Help confirmed (+20 NP) → notify the helper who earned it.
CREATE OR REPLACE FUNCTION public.notify_on_np_award()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM public.queue_notification(
      NEW.profile_id, 'help_confirmed',
      'Help confirmed',
      'Your help was confirmed — +20 NP. Thank you for showing up.',
      'post', NEW.post_id
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_np_award ON public.np_ledger;
CREATE TRIGGER trg_notify_np_award
  AFTER INSERT ON public.np_ledger
  FOR EACH ROW WHEN (NEW.reason = 'help_confirmed')
  EXECUTE FUNCTION public.notify_on_np_award();

-- 3d. Public gratitude posted → notify the helper.
CREATE OR REPLACE FUNCTION public.notify_on_gratitude()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.helper_id <> NEW.thanker_id THEN
    BEGIN
      PERFORM public.queue_notification(
        NEW.helper_id, 'gratitude',
        'You were thanked',
        'A neighbor thanked you publicly for your help.',
        'gratitude_post', NEW.id
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_gratitude ON public.gratitude_posts;
CREATE TRIGGER trg_notify_gratitude
  AFTER INSERT ON public.gratitude_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_gratitude();

-- 3e. New help request → notify opted-in neighbors in the same town.
-- Recipients: profiles sharing the post owner's town, excluding the
-- owner and anyone blocked either way. queue_notification applies
-- each recipient's opt-in, toggles, dedup, caps, and quiet hours,
-- so this loop cannot spam anyone who hasn't asked for it.
CREATE OR REPLACE FUNCTION public.notify_on_new_post()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_town TEXT;
  r RECORD;
BEGIN
  SELECT town INTO v_town FROM public.profiles WHERE id = NEW.owner_id;
  IF v_town IS NULL THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT p.id AS recipient_id
    FROM public.profiles p
    WHERE p.town = v_town
      AND p.id <> NEW.owner_id
      AND NOT public.is_blocked(NEW.owner_id, p.id)
  LOOP
    BEGIN
      PERFORM public.queue_notification(
        r.recipient_id, 'help_nearby',
        'Help needed nearby',
        'A neighbor in your town just asked for help.',
        'post', NEW.id
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- One recipient's failure must not stop the others.
    END;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_post ON public.posts;
CREATE TRIGGER trg_notify_new_post
  AFTER INSERT ON public.posts
  FOR EACH ROW WHEN (NEW.kind = 'help')
  EXECUTE FUNCTION public.notify_on_new_post();

-- Trigger functions are not client-callable endpoints.
REVOKE ALL ON FUNCTION public.notify_on_volunteer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_on_message() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_on_np_award() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_on_gratitude() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_on_new_post() FROM PUBLIC;
