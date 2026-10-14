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
