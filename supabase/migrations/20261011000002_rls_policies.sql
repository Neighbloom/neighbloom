-- Milestone 1: Row Level Security policies.
-- Principle: public read, owner-only write. No service-role bypass needed for app flows.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;

-- PROFILES ---------------------------------------------------------------
-- Anyone can read profiles (needed for feed display names, avatars).
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  USING (true);

-- Users can only update their own profile.
-- Note: the np column is further protected by the prevent_np_tampering trigger.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profiles are created by the signup trigger, not by clients.
-- No INSERT policy for authenticated users (trigger uses SECURITY DEFINER).
-- No DELETE policy: users cannot delete their profile.

-- POSTS ------------------------------------------------------------------
-- Anyone (including anonymous) can read posts — public neighborhood feed.
DROP POLICY IF EXISTS "posts_select_all" ON public.posts;
CREATE POLICY "posts_select_all"
  ON public.posts FOR SELECT
  USING (true);

-- Authenticated users can create posts. owner_id must match their own id.
-- System fields (stage, status, helpers) default on insert; the
-- prevent_post_system_field_tampering trigger blocks direct modification.
DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own"
  ON public.posts FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Only the owner can update their posts (editable fields only;
-- system fields protected by trigger).
DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own"
  ON public.posts FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Only the owner can delete their posts.
DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own"
  ON public.posts FOR DELETE
  USING (auth.uid() = owner_id);

-- REPLIES ----------------------------------------------------------------
-- Anyone can read replies.
DROP POLICY IF EXISTS "replies_select_all" ON public.replies;
CREATE POLICY "replies_select_all"
  ON public.replies FOR SELECT
  USING (true);

-- Authenticated users can reply. author_id must match their own id.
DROP POLICY IF EXISTS "replies_insert_own" ON public.replies;
CREATE POLICY "replies_insert_own"
  ON public.replies FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Only the author can update their replies.
DROP POLICY IF EXISTS "replies_update_own" ON public.replies;
CREATE POLICY "replies_update_own"
  ON public.replies FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- Only the author can delete their replies.
DROP POLICY IF EXISTS "replies_delete_own" ON public.replies;
CREATE POLICY "replies_delete_own"
  ON public.replies FOR DELETE
  USING (auth.uid() = author_id);

-- GRANTS (required because "Automatically expose new tables" is OFF) -----
-- Least privilege: anon gets read-only; authenticated gets what RLS allows.
-- RLS policies remain the primary enforcement; these GRANTs only control
-- table-level API visibility, not row-level access.

-- anon: public read-only feed access
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.posts TO anon;
GRANT SELECT ON public.replies TO anon;

-- authenticated: read + write (RLS restricts to own rows; no profile INSERT/DELETE)
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replies TO authenticated;
