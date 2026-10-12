-- Milestone 1: Core tables for Neighbloom (profiles, posts, replies)
-- All tables have Row Level Security enabled with restrictive policies.

-- Profiles: one row per authenticated user, created on signup via trigger.
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  handle TEXT UNIQUE,
  town TEXT,
  avatar_url TEXT,
  np INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Posts: help requests and recommendations.
CREATE TABLE posts (
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

CREATE INDEX posts_owner_idx ON posts(owner_id);
CREATE INDEX posts_kind_idx ON posts(kind);
CREATE INDEX posts_created_idx ON posts(created_at DESC);
CREATE INDEX posts_area_idx ON posts(area);

-- Replies: volunteer offers and recommendation responses.
CREATE TABLE replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'suggestion' CHECK (kind IN ('volunteer', 'suggestion')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX replies_post_idx ON replies(post_id);
CREATE INDEX replies_author_idx ON replies(author_id);

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

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
