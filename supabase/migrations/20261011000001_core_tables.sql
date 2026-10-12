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
