-- Milestone 1: Row Level Security policies.
-- Principle: public read, owner-only write. No service-role bypass needed for app flows.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;

-- PROFILES ---------------------------------------------------------------
-- Anyone can read profiles (needed for feed display names, avatars).
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all"
  ON profiles FOR SELECT
  USING (true);

-- Users can only update their own profile.
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profiles are created by the signup trigger, not by clients.
-- No INSERT policy for authenticated users (trigger uses SECURITY DEFINER).

-- POSTS ------------------------------------------------------------------
-- Anyone (including anonymous) can read posts — public neighborhood feed.
DROP POLICY IF EXISTS "posts_select_all" ON posts;
CREATE POLICY "posts_select_all"
  ON posts FOR SELECT
  USING (true);

-- Authenticated users can create posts. owner_id must match their own id.
DROP POLICY IF EXISTS "posts_insert_own" ON posts;
CREATE POLICY "posts_insert_own"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Only the owner can update their posts.
DROP POLICY IF EXISTS "posts_update_own" ON posts;
CREATE POLICY "posts_update_own"
  ON posts FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Only the owner can delete their posts.
DROP POLICY IF EXISTS "posts_delete_own" ON posts;
CREATE POLICY "posts_delete_own"
  ON posts FOR DELETE
  USING (auth.uid() = owner_id);

-- REPLIES ----------------------------------------------------------------
-- Anyone can read replies.
DROP POLICY IF EXISTS "replies_select_all" ON replies;
CREATE POLICY "replies_select_all"
  ON replies FOR SELECT
  USING (true);

-- Authenticated users can reply. author_id must match their own id.
DROP POLICY IF EXISTS "replies_insert_own" ON replies;
CREATE POLICY "replies_insert_own"
  ON replies FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Only the author can update their replies.
DROP POLICY IF EXISTS "replies_update_own" ON replies;
CREATE POLICY "replies_update_own"
  ON replies FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- Only the author can delete their replies.
DROP POLICY IF EXISTS "replies_delete_own" ON replies;
CREATE POLICY "replies_delete_own"
  ON replies FOR DELETE
  USING (auth.uid() = author_id);
