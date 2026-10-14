-- ============================================================
-- Neighbloom migration 13 — M4: notification mark-as-read
--
-- Problem (found by live integration testing on dev,
-- 2026-10-12): migration 00008 granted only SELECT on
-- public.notifications. The app therefore cannot persist
-- read_at — PATCH /rest/v1/notifications returns 403 — so
-- the Activity tab can display notifications but can never
-- mark them read. Everything would look unread forever.
--
-- Fix (minimal, least privilege):
--   * Column-level GRANT UPDATE (read_at) to authenticated:
--     users can modify the read_at column ONLY — title, body,
--     type, profile_id and every other column stay read-only
--     even for the row's owner.
--   * One UPDATE policy scoped to the caller's own rows.
--
-- No other grants or policies change. Fully idempotent.
-- ============================================================

GRANT UPDATE (read_at) ON public.notifications TO authenticated;

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own
  ON public.notifications FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);
