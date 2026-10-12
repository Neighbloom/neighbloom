-- Milestone 2: Server-side input validation.
--
-- The M1 schema has no length limits. A malicious client could insert
-- multi-megabyte text fields. These CHECK constraints enforce sane limits
-- at the database level, which cannot be bypassed by raw API calls.
--
-- IDEMPOTENCY: Each constraint is added only if it does not already exist.
-- Safe to re-run. Uses pg_constraint catalog check in a DO block.

DO $$
BEGIN
  -- Post title: 3-200 chars
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'posts_title_length'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_title_length
      CHECK (pg_catalog.char_length(title) >= 3 AND pg_catalog.char_length(title) <= 200);
  END IF;

  -- Post details: max 2000 chars
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'posts_details_length'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_details_length
      CHECK (details IS NULL OR pg_catalog.char_length(details) <= 2000);
  END IF;

  -- Post area: max 100 chars (town/neighborhood name)
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'posts_area_length'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_area_length
      CHECK (area IS NULL OR pg_catalog.char_length(area) <= 100);
  END IF;

  -- Reply body: 1-1000 chars
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'replies_body_length'
  ) THEN
    ALTER TABLE public.replies
      ADD CONSTRAINT replies_body_length
      CHECK (pg_catalog.char_length(body) >= 1 AND pg_catalog.char_length(body) <= 1000);
  END IF;

  -- Profile display_name: 1-50 chars (prevent 10KB hostile names)
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'profiles_display_name_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_display_name_length
      CHECK (pg_catalog.char_length(display_name) >= 1 AND pg_catalog.char_length(display_name) <= 50);
  END IF;

  -- Profile town: max 100 chars
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'profiles_town_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_town_length
      CHECK (town IS NULL OR pg_catalog.char_length(town) <= 100);
  END IF;

  -- Profile handle: max 30 chars, alphanumeric + underscore only (when set)
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'profiles_handle_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_handle_format
      CHECK (handle IS NULL OR (pg_catalog.char_length(handle) <= 30 AND handle ~ '^[a-zA-Z0-9_]+$'));
  END IF;

  -- Profile avatar_url: max 500 chars (URL)
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'profiles_avatar_url_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_avatar_url_length
      CHECK (avatar_url IS NULL OR pg_catalog.char_length(avatar_url) <= 500);
  END IF;
END;
$$;

-- Messages already have body length check (1-2000) from 20261012000003.
-- Conversations need no additional constraints.
