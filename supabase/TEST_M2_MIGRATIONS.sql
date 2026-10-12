-- ============================================================
-- Neighbloom M2 Migration Test Suite (Executable)
--
-- Tests RLS by switching roles at the TOP LEVEL (not inside functions).
-- PostgreSQL forbids SET ROLE inside SECURITY DEFINER functions.
--
-- Each test section:
--   1. SET ROLE authenticated (or anon)
--   2. SET request.jwt.claims for auth.uid()
--   3. Run test queries (RLS applies)
--   4. RESET ROLE (back to postgres)
--
-- Failed assertions RAISE EXCEPTION, stopping the run immediately.
-- ============================================================

-- ============================================================
-- Helper: Assert function (no role switching, safe to call anywhere)
-- ============================================================
CREATE OR REPLACE FUNCTION public._assert(
  p_condition BOOLEAN,
  p_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT p_condition THEN
    RAISE EXCEPTION 'TEST FAILED: %', p_message;
  END IF;
  RAISE NOTICE 'PASS: %', p_message;
END;
$$;

-- ============================================================
-- CONFIG: Test user UUIDs (must match CI workflow)
-- ============================================================
-- These are created by the CI workflow before running tests.
-- For manual runs, replace with your actual test user UUIDs.

-- ============================================================
-- SETUP: Configure test profiles (as postgres)
-- ============================================================
DO $$
DECLARE
  v_user_a UUID := '00000000-0000-0000-0000-000000000001';
  v_user_b UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
  RAISE NOTICE '=== SETUP: Configuring test profiles ===';

  UPDATE public.profiles
  SET intro = 'Private intro - B should NOT see this',
      intro_visible = false,
      skills = ARRAY['secret skill']
  WHERE id = v_user_a;

  UPDATE public.profiles
  SET intro = 'Public intro - everyone can see this',
      intro_visible = true,
      skills = ARRAY['cooking', 'yard work']
  WHERE id = v_user_b;

  RAISE NOTICE 'Setup complete.';
END;
$$;

-- ============================================================
-- TEST 1: Privacy - User B cannot see User A's hidden intro
-- ============================================================

-- Test 1a: User B queries view (should get NULL)
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
DO $$
DECLARE
  v_intro TEXT;
  v_skills TEXT[];
BEGIN
  SELECT intro, skills INTO v_intro, v_skills
  FROM public.visible_profiles
  WHERE id = '00000000-0000-0000-0000-000000000001';
  PERFORM public._assert(
    v_intro IS NULL AND v_skills IS NULL,
    '1a: User B sees NULL intro/skills for hidden profile via view'
  );
END;
$$;
RESET ROLE;

-- Test 1b: User B direct table access (should fail with permission denied)
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
DO $$
DECLARE
  v_intro TEXT;
BEGIN
  BEGIN
    SELECT intro INTO v_intro
    FROM public.profiles
    WHERE id = '00000000-0000-0000-0000-000000000001';
    -- If we reach here, the column was accessible (BAD)
    PERFORM public._assert(false, '1b: Direct table access should fail');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM public._assert(true, '1b: Direct SELECT on intro denied (permission error)');
  END;
END;
$$;
RESET ROLE;

-- Test 1c: Owner sees own hidden intro via view
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  v_intro TEXT;
BEGIN
  SELECT intro INTO v_intro
  FROM public.visible_profiles
  WHERE id = '00000000-0000-0000-0000-000000000001';
  PERFORM public._assert(
    v_intro = 'Private intro - B should NOT see this',
    '1c: Owner sees own hidden intro via view'
  );
END;
$$;
RESET ROLE;

-- Test 1d: Anon sees NULL for hidden, value for public
SET ROLE anon;
SELECT set_config('request.jwt.claims', '{}', true);
DO $$
DECLARE
  v_intro TEXT;
BEGIN
  SELECT intro INTO v_intro
  FROM public.visible_profiles
  WHERE id = '00000000-0000-0000-0000-000000000001';
  PERFORM public._assert(v_intro IS NULL, '1d: Anon sees NULL for hidden intro');

  SELECT intro INTO v_intro
  FROM public.visible_profiles
  WHERE id = '00000000-0000-0000-0000-000000000002';
  PERFORM public._assert(
    v_intro = 'Public intro - everyone can see this',
    '1d: Anon sees public intro'
  );
END;
$$;
RESET ROLE;

-- ============================================================
-- TEST 2: Helper counts (public data, anon allowed)
-- ============================================================
SET ROLE anon;
SELECT set_config('request.jwt.claims', '{}', true);
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT public.get_help_count('00000000-0000-0000-0000-000000000002') INTO v_count;
  PERFORM public._assert(v_count >= 0, '2a: Anon can get help count');
END;
$$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT public.get_help_count('00000000-0000-0000-0000-000000000002') INTO v_count;
  PERFORM public._assert(v_count >= 0, '2b: Authenticated can get help count');
END;
$$;
RESET ROLE;

-- ============================================================
-- TEST 3: Directory filtering
-- ============================================================
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
DO $$
DECLARE
  v_found BOOLEAN;
BEGIN
  -- Hidden profile excluded
  SELECT EXISTS (
    SELECT 1 FROM public.get_neighbor_directory(NULL, 50)
    WHERE id = '00000000-0000-0000-0000-000000000001'
  ) INTO v_found;
  PERFORM public._assert(NOT v_found, '3a: Directory excludes hidden profiles');

  -- Visible profile included
  SELECT EXISTS (
    SELECT 1 FROM public.get_neighbor_directory(NULL, 50)
    WHERE id = '00000000-0000-0000-0000-000000000002'
  ) INTO v_found;
  PERFORM public._assert(v_found, '3b: Directory includes visible profiles');
END;
$$;
RESET ROLE;

-- ============================================================
-- TEST 4: Blocking enforcement
-- ============================================================

-- Setup: Create block (as postgres)
INSERT INTO public.blocks (blocker_id, blocked_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT DO NOTHING;

-- Test 4a: is_blocked symmetric
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  v_blocked BOOLEAN;
BEGIN
  SELECT public.is_blocked(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
  ) INTO v_blocked;
  PERFORM public._assert(v_blocked, '4a: is_blocked(A,B) = true');

  SELECT public.is_blocked(
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001'
  ) INTO v_blocked;
  PERFORM public._assert(v_blocked, '4a: is_blocked(B,A) = true (symmetric)');
END;
$$;
RESET ROLE;

-- Test 4b: Blocked user excluded from directory
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.get_neighbor_directory(NULL, 50)
  WHERE id = '00000000-0000-0000-0000-000000000002';
  PERFORM public._assert(v_count = 0, '4b: Blocked user excluded from directory');
END;
$$;
RESET ROLE;

-- Cleanup: Remove test block (as postgres)
DELETE FROM public.blocks
WHERE blocker_id = '00000000-0000-0000-0000-000000000001'
  AND blocked_id = '00000000-0000-0000-0000-000000000002';

-- ============================================================
-- TEST 5: RLS isolation (cross-account)
-- ============================================================

-- Test 5a: Cannot read other's ledger
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.np_ledger
  WHERE profile_id = '00000000-0000-0000-0000-000000000001';
  PERFORM public._assert(v_count = 0, '5a: Cannot read other user ledger');
END;
$$;
RESET ROLE;

-- Test 5b: Cannot update other's profile
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
DO $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.profiles SET display_name = 'Hacked'
  WHERE id = '00000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public._assert(v_count = 0, '5b: Cannot update other user profile');
END;
$$;
RESET ROLE;

-- ============================================================
-- CLEANUP
-- ============================================================
DROP FUNCTION IF EXISTS public._assert(BOOLEAN, TEXT);

SELECT 'All tests passed!' AS result;
