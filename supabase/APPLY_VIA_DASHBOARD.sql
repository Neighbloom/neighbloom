-- ============================================================
-- Neighbloom Milestone 1 — Combined Migration Script
-- Branch: felix/m1-auth-posts
-- Generated: 2026-10-12T03:45:22Z
--
-- IMPORTANT:
-- - This script creates a trigger on auth.users (handle_new_user)
--   that automatically inserts into public.profiles on signup.
-- - Includes explicit GRANTs (required: auto-expose new tables is OFF).
-- - All statements are idempotent (IF NOT EXISTS / OR REPLACE).
-- - Executes atomically within a single transaction.
-- - Safe for a newly created, empty Supabase development project.
-- ============================================================

BEGIN;

-- Milestone 1: Core tables for Neighbloom (profiles, posts, replies)
-- All tables have Row Level Security enabled with restrictive policies.
--
-- NOTE: This migration creates a trigger on auth.users (handle_new_user)
-- that automatically inserts into public.profiles on signup.

-- Profiles: one row per authenticated user, created on signup via trigger.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  handle TEXT UNIQUE,
  town TEXT,
  avatar_url TEXT,
  np INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- Posts: help requests and recommendations.
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS posts_owner_idx ON public.posts(owner_id);
CREATE INDEX IF NOT EXISTS posts_kind_idx ON public.posts(kind);
CREATE INDEX IF NOT EXISTS posts_created_idx ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS posts_area_idx ON public.posts(area);

-- Replies: volunteer offers and recommendation responses.
CREATE TABLE IF NOT EXISTS public.replies (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'suggestion' CHECK (kind IN ('volunteer', 'suggestion')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS replies_post_idx ON public.replies(post_id);
CREATE INDEX IF NOT EXISTS replies_author_idx ON public.replies(author_id);

-- Auto-create profile on signup.
-- SECURITY DEFINER with empty search_path (Supabase recommended hardening).
-- This trigger fires on auth.users INSERT and writes to public.profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, handle)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'Neighbor'),
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated-at trigger for posts.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS posts_updated_at ON public.posts;
CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

-- Milestone 1: Protect system-controlled fields from direct user manipulation.
--
-- RLS restricts which ROWS a user can update, not which COLUMNS.
-- These triggers block direct modification of fields that must only change
-- through trusted server-side workflows (Milestone 2+).
--
-- Protected fields:
--   profiles.np             — Neighbor Points balance
--   posts.stage             — help lifecycle stage (open → booked → started → done → confirmed)
--   posts.status            — post status
--   posts.helpers           — selected helper assignments (JSONB)
--
-- Legitimate user-editable fields (NOT blocked):
--   profiles: display_name, handle, town, avatar_url
--   posts: title, details, area, category, pref_tags, helpers_needed
--   replies: body, kind
--
-- No award_np() function is created in Milestone 1. NP awards are not
-- implemented; the np column is immutable via API until Milestone 2
-- introduces the authorized award mechanism.

-- 1. Block direct np modification ----------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_np_tampering()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.np IS DISTINCT FROM NEW.np THEN
    RAISE EXCEPTION 'Direct NP modification is not allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS protect_np_column ON public.profiles;
CREATE TRIGGER protect_np_column
  BEFORE UPDATE OF np ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_np_tampering();

-- 2. Block direct modification of post system fields ----------------------
CREATE OR REPLACE FUNCTION public.prevent_post_system_field_tampering()
RETURNS TRIGGER AS $$
BEGIN
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
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS protect_post_system_fields ON public.posts;
CREATE TRIGGER protect_post_system_fields
  BEFORE UPDATE OF stage, status, helpers ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_post_system_field_tampering();

-- 3. Force system field defaults on INSERT ---------------------------------
-- A user could try to set stage='done' or helpers=[...] during INSERT.
-- This trigger silently enforces safe defaults, ignoring malicious input.
CREATE OR REPLACE FUNCTION public.enforce_post_defaults_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.stage := 'open';
  NEW.status := 'open';
  NEW.helpers := '[]'::jsonb;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS enforce_post_defaults ON public.posts;
CREATE TRIGGER enforce_post_defaults
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_post_defaults_on_insert();

COMMIT;
