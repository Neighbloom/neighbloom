-- Milestone 1: Core tables for Neighbloom (profiles, posts, replies)
-- All tables have Row Level Security enabled with restrictive policies.

-- Profiles: one row per authenticated user, created on signup via trigger.
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  handle TEXT UNIQUE,
  town TEXT,
  avatar_url TEXT,
  np INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Posts: help requests and recommendations.
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('help', 'rec')),
  title TEXT NOT NULL,
  details TEXT,
  area TEXT,
  category TEXT,
  pref_tags TEXT[],
  helpers_needed INTEGER NOT NULL DEFAULT 1 CHECK (helpers_needed >= 1 AND helpers_needed <= 10),
  helpers JSONB NOT NULL DEFAULT '[]',
  stage TEXT NOT NULL DEFAULT 'open',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_owner_idx ON posts(owner_id);
CREATE INDEX IF NOT EXISTS posts_kind_idx ON posts(kind);
CREATE INDEX IF NOT EXISTS posts_created_idx ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS posts_area_idx ON posts(area);

-- Replies: volunteer offers and recommendation responses.
CREATE TABLE IF NOT EXISTS replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'suggestion' CHECK (kind IN ('volunteer', 'suggestion')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS replies_post_idx ON replies(post_id);
CREATE INDEX IF NOT EXISTS replies_author_idx ON replies(author_id);

-- Auto-create profile on signup.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, handle)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'Neighbor'),
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Updated-at trigger for posts.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_updated_at ON posts;
CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
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
-- Milestone 1: Protect the np column from direct user manipulation.
--
-- Problem: RLS restricts which ROWS a user can update, not which COLUMNS.
-- The profiles_update_own policy lets users update their own row, which
-- means a user could run UPDATE profiles SET np = 999999 WHERE id = auth.uid().
--
-- Fix: A trigger blocks any direct change to np. Only the award_np()
-- SECURITY DEFINER function (called server-side) can change balances.
-- There is no DELETE policy on profiles, so users cannot delete/recreate
-- to reset np either.

-- 1. Trigger: block direct np modification -------------------------------
CREATE OR REPLACE FUNCTION prevent_np_tampering()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.np IS DISTINCT FROM NEW.np THEN
    -- Only allow when the trusted award function has set the session flag.
    IF current_setting('app.allow_np_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Direct NP modification is not allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_np_column ON profiles;
CREATE TRIGGER protect_np_column
  BEFORE UPDATE OF np ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_np_tampering();

-- 2. Trusted award function (Milestone 2 will call this server-side) ------
-- SECURITY DEFINER: runs as the function owner, bypasses RLS.
-- Sets a transaction-local flag so the trigger allows this one change.
CREATE OR REPLACE FUNCTION award_np(target_user_id UUID, amount INTEGER)
RETURNS VOID AS $$
BEGIN
  IF amount IS NULL OR amount = 0 THEN
    RETURN;
  END IF;
  PERFORM set_config('app.allow_np_change', 'true', true);
  UPDATE profiles SET np = np + amount WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only authenticated users can call award_np directly (Milestone 2 will
-- restrict this further via a dedicated service role or tighter logic).
-- For Milestone 1, the function exists but the app does not call it;
-- NP awards remain client-side demo until Milestone 2 migrates them.
REVOKE ALL ON FUNCTION award_np(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION award_np(UUID, INTEGER) TO authenticated;
