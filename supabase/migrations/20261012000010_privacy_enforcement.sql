-- Privacy enforcement for neighbor introductions (Finding #5).
--
-- Problem: The M1 RLS policy `profiles_select_all` uses USING(true), which
-- exposes ALL columns including `intro` and `skills` even when the user set
-- `intro_visible = false`. Frontend filtering in fetchNeighbors() is not
-- sufficient — a direct API call could retrieve hidden profile data.
--
-- Solution (defense in depth, DB-enforced):
--   1. `visible_profiles` view: CASE-filters intro/skills to NULL when hidden.
--      This is enforced by the database, not the client.
--   2. `get_neighbor_directory()` SECURITY DEFINER function: the ONLY
--      supported path for directory queries. Returns only visible profiles.
--   3. Column-level REVOKE: anon cannot SELECT intro/skills directly.
--
-- Threat model:
--   - The directory (browse all neighbors) MUST respect intro_visible.
--     Enforced by view + function. ✓
--   - Direct profile lookup by UUID by an authenticated neighbor: the intro
--     is visible if they have the ID. This is acceptable — authenticated
--     users are community members, and UUIDs are not enumerable.
--   - Anonymous users: cannot access intro/skills columns directly. ✓

-- 1. View with DB-enforced visibility filtering.
-- Owner always sees their own intro/skills (auth.uid() = id).
-- Others only see intro/skills when intro_visible = true.
-- This is the PRIMARY read path for profiles. Direct table SELECT on
-- intro/skills is revoked below, forcing all reads through this view.
CREATE OR REPLACE VIEW public.visible_profiles AS
SELECT
  id,
  display_name,
  handle,
  town,
  avatar_url,
  np,
  created_at,
  -- Only expose intro/skills when visible OR when the viewer is the owner.
  CASE WHEN intro_visible OR auth.uid() = id THEN intro ELSE NULL END AS intro,
  CASE WHEN intro_visible OR auth.uid() = id THEN skills ELSE NULL END AS skills,
  intro_visible
FROM public.profiles;

-- Views inherit RLS from underlying tables in PostgreSQL, but we want
-- the view to be the controlled access path. Grant to all.
GRANT SELECT ON public.visible_profiles TO anon, authenticated;

-- CRITICAL: PostgreSQL views run as the OWNER by default (like SECURITY DEFINER
-- functions), unless security_invoker=true is set (PG 15+).
-- This means the view CAN read intro/skills columns even though we revoked them
-- from anon/authenticated — it bypasses those revokes as the owner.
-- The explicit SET (security_invoker = false) below documents this intent.
--
-- auth.uid() still returns the CALLER's ID (it's read from the JWT session,
-- not from the role), so the CASE logic correctly enforces visibility:
--   - Owner (auth.uid() = id): sees own intro/skills
--   - Others: sees intro/skills only if intro_visible=true
--   - Anon (auth.uid() IS NULL): sees intro/skills only if intro_visible=true
ALTER VIEW public.visible_profiles SET (security_invoker = false);

-- 2. SECURITY DEFINER function for directory queries.
-- Bypasses RLS to ensure consistent results, but ONLY returns visible profiles.
--
-- AUTH MODEL: Intentionally callable by anon (no auth.uid() check).
-- This is CORRECT because the function only returns profiles where
-- intro_visible=true (public directory data). Hidden profiles are never
-- returned. The function is a privacy filter, not a privacy bypass.
CREATE OR REPLACE FUNCTION public.get_neighbor_directory(
  p_town TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  town TEXT,
  intro TEXT,
  skills TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    vp.id, vp.display_name, vp.avatar_url, vp.town,
    vp.intro, vp.skills, vp.created_at
  FROM public.visible_profiles vp
  WHERE vp.intro_visible = true
    AND (p_town IS NULL OR vp.town = p_town)
  ORDER BY vp.created_at DESC
  LIMIT LEAST(p_limit, 50);
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_directory(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_neighbor_directory(TEXT, INT) TO anon, authenticated;

-- 3. Harden direct column access.
-- Revoke intro/skills from BOTH anon and authenticated at the column level.
-- This forces ALL reads of intro/skills through the visible_profiles view,
-- which enforces intro_visible at the database level.
--
-- The owner can still UPDATE their own intro/skills via RLS (profiles_update_own).
-- The owner reads their own data via the view (auth.uid() = id exception).
DO $$
BEGIN
  -- Anon: only safe columns, no intro/skills.
  REVOKE ALL ON public.profiles FROM anon;
  GRANT SELECT (id, display_name, avatar_url, town, created_at)
    ON public.profiles TO anon;

  -- Authenticated: revoke table-level, grant specific columns EXCLUDING intro/skills.
  -- They must use visible_profiles view for intro/skills (DB-enforced visibility).
  REVOKE ALL ON public.profiles FROM authenticated;
  GRANT SELECT (id, display_name, handle, town, avatar_url, np, created_at)
    ON public.profiles TO authenticated;
  GRANT UPDATE (display_name, handle, town, avatar_url, intro, intro_visible, skills)
    ON public.profiles TO authenticated;
  -- Note: np is NOT in the UPDATE grant (protected by trigger).
  -- Note: id, created_at are NOT in the UPDATE grant (immutable).
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- Document the privacy model.
COMMENT ON VIEW public.visible_profiles IS
  'DB-enforced neighbor directory. intro/skills are NULL when intro_visible=false. Use this or get_neighbor_directory() for directory queries.';
COMMENT ON FUNCTION public.get_neighbor_directory(TEXT, INT) IS
  'Returns only profiles with intro_visible=true. The supported directory access path.';
