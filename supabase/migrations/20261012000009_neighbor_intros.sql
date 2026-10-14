-- Welcome to Worth + Your Neighbors: neighbor introductions.
--
-- Part of the coherent first-visit experience (Concepts A+B, founder-approved).
-- New members write a brief intro: who they are, roughly where, what they're
-- good at or happy to help with. This powers the "Your Neighbors" directory
-- and makes the first visit feel human, not empty.

-- Add intro fields to profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS intro TEXT
  CHECK (intro IS NULL OR pg_catalog.char_length(intro) <= 200);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS intro_visible BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skills TEXT[]
  CHECK (skills IS NULL OR pg_catalog.array_length(skills, 1) <= 10);

-- Skills are simple tags like 'yard work', 'plumbing', 'cooking', 'rides'.
-- Used for "The Right Ask" skill matching (Concept D).

-- Update the profile update allowlist comment:
-- profiles: display_name, handle, town, avatar_url, intro, intro_visible, skills
-- (np, id, created_at remain protected)

-- Index for neighbor directory queries.
CREATE INDEX IF NOT EXISTS idx_profiles_town_visible
  ON public.profiles(town) WHERE intro_visible = true;
