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
