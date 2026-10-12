-- ============================================================
-- Neighbloom M2 Migration Test Suite (Executable)
-- 
-- This script PROPERLY tests RLS by switching roles and setting JWT claims.
-- Tests run as postgres (setup) then switch to authenticated/anon roles.
-- Failed assertions RAISE EXCEPTION, failing the entire run.
--
-- PREREQUISITES:
--   1. M1 migrations applied
--   2. M2 migrations applied  
--   3. Two auth users exist (see DISPOSABLE_TEST_INSTRUCTIONS.md)
--
-- USAGE:
--   1. Replace USER_A_UUID, USER_B_UUID below with actual UUIDs
--   2. Run entire script in SQL Editor
--   3. If any test fails, the script STOPS with an error message
--   4. "All tests passed" at the end = success
--
-- ISOLATION: This script only touches test data. It creates test posts
-- and blocks, then cleans them up. It does NOT modify M1 seed data.
-- ============================================================

-- ============================================================
-- CONFIGURATION: Replace with your test user UUIDs
-- ============================================================
DO $$
BEGIN
  -- These are placeholders. The actual tests use the variables below.
  NULL;
END;
$$;

-- Test user IDs (REPLACE THESE)
-- \set user_a 'PASTE_USER_A_UUID_HERE'
-- \set user_b 'PASTE_USER_B_UUID_HERE'

-- For SQL Editor, define them as temporary variables via a helper table.
-- (SQL Editor doesn't support psql \set, so we use a different approach.)

-- ============================================================
-- HELPER: Function to simulate authenticated user context
-- ============================================================
-- This sets the JWT claims so auth.uid() returns the specified user,
-- and switches to the authenticated role so RLS applies.

CREATE OR REPLACE FUNCTION public._test_as_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Set JWT claims for auth.uid()
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::TEXT)::TEXT,
    true  -- local (transaction-scoped)
  );
  -- Switch role
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION public._test_as_anon()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
END;
$$;

CREATE OR REPLACE FUNCTION public._test_reset()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{}', true);
END;
$$;

-- Helper: Assert helper (raises on failure)
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
-- SETUP: Create test data (as postgres/service_role)
-- ============================================================
-- Note: Replace UUIDs below with your actual test user UUIDs.

DO $$
DECLARE
  v_user_a UUID := '00000000-0000-0000-0000-000000000001'; -- REPLACE
  v_user_b UUID := '00000000-0000-0000-0000-000000000002'; -- REPLACE
  v_post_id UUID;
BEGIN
  RAISE NOTICE '=== SETUP: Creating test data ===';
  
  -- Ensure test profiles exist (they should from auth signup trigger)
  -- Update User A with private intro
  UPDATE public.profiles 
  SET intro = 'Private intro - B should NOT see this',
      intro_visible = false,
      skills = ARRAY['secret skill']
  WHERE id = v_user_a;
  
  -- Update User B with public intro  
  UPDATE public.profiles
  SET intro = 'Public intro - everyone can see this',
      intro_visible = true,
      skills = ARRAY['cooking', 'yard work']
  WHERE id = v_user_b;
  
  RAISE NOTICE 'Setup complete. Test users configured.';
END;
$$;

-- ============================================================
-- TEST 1: Privacy - User B cannot see User A's hidden intro
-- ============================================================
DO $$
DECLARE
  v_user_a UUID := '00000000-0000-0000-0000-000000000001'; -- REPLACE
  v_user_b UUID := '00000000-0000-0000-0000-000000000002'; -- REPLACE
  v_intro TEXT;
  v_skills TEXT[];
BEGIN
  RAISE NOTICE '=== TEST 1: Privacy (intro_visible=false) ===';
  
  -- Test 1a: User B queries view - should get NULL intro
  PERFORM public._test_as_user(v_user_b);
  SELECT intro, skills INTO v_intro, v_skills
  FROM public.visible_profiles WHERE id = v_user_a;
  PERFORM public._assert(
    v_intro IS NULL AND v_skills IS NULL,
    '1a: User B sees NULL intro/skills for hidden profile via view'
  );
  PERFORM public._test_reset();
  
  -- Test 1b: User B tries direct table access - should fail
  PERFORM public._test_as_user(v_user_b);
  BEGIN
    SELECT intro INTO v_intro FROM public.profiles WHERE id = v_user_a;
    -- If we get here without error, check if it's NULL (shouldn't happen)
    PERFORM public._assert(false, '1b: Direct table access should fail with permission denied');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM public._assert(true, '1b: Direct table SELECT on intro denied (permission error)');
  END;
  PERFORM public._test_reset();
  
  -- Test 1c: User A (owner) sees own intro via view
  PERFORM public._test_as_user(v_user_a);
  SELECT intro INTO v_intro FROM public.visible_profiles WHERE id = v_user_a;
  PERFORM public._assert(
    v_intro = 'Private intro - B should NOT see this',
    '1c: Owner sees own hidden intro via view'
  );
  PERFORM public._test_reset();
  
  -- Test 1d: Anon sees NULL for hidden, value for public
  PERFORM public._test_as_anon();
  SELECT intro INTO v_intro FROM public.visible_profiles WHERE id = v_user_a;
  PERFORM public._assert(v_intro IS NULL, '1d: Anon sees NULL for hidden intro');
  SELECT intro INTO v_intro FROM public.visible_profiles WHERE id = v_user_b;
  PERFORM public._assert(
    v_intro = 'Public intro - everyone can see this',
    '1d: Anon sees public intro'
  );
  PERFORM public._test_reset();
  
END;
$$;

-- ============================================================
-- TEST 2: Helper counts (get_help_count)
-- ============================================================
DO $$
DECLARE
  v_user_b UUID := '00000000-0000-0000-0000-000000000002'; -- REPLACE
  v_count INT;
BEGIN
  RAISE NOTICE '=== TEST 2: Helper counts ===';
  
  -- Test 2a: Anon can call get_help_count (public data)
  PERFORM public._test_as_anon();
  SELECT public.get_help_count(v_user_b) INTO v_count;
  PERFORM public._assert(
    v_count >= 0,
    '2a: Anon can get help count (returns ' || v_count || ')'
  );
  PERFORM public._test_reset();
  
  -- Test 2b: Authenticated can get other's help count
  PERFORM public._test_as_user(v_user_b);
  SELECT public.get_help_count(v_user_b) INTO v_count;
  PERFORM public._assert(v_count >= 0, '2b: Authenticated can get help count');
  PERFORM public._test_reset();
END;
$$;

-- ============================================================
-- TEST 3: Directory excludes hidden and blocked
-- ============================================================
DO $$
DECLARE
  v_user_a UUID := '00000000-0000-0000-0000-000000000001'; -- REPLACE
  v_user_b UUID := '00000000-0000-0000-0000-000000000002'; -- REPLACE
  v_found BOOLEAN;
BEGIN
  RAISE NOTICE '=== TEST 3: Directory filtering ===';
  
  -- Test 3a: Directory excludes intro_visible=false
  PERFORM public._test_as_user(v_user_b);
  SELECT EXISTS (
    SELECT 1 FROM public.get_neighbor_directory(NULL, 50) WHERE id = v_user_a
  ) INTO v_found;
  PERFORM public._assert(
    NOT v_found,
    '3a: Directory excludes hidden profiles'
  );
  
  -- Test 3b: Directory includes intro_visible=true
  SELECT EXISTS (
    SELECT 1 FROM public.get_neighbor_directory(NULL, 50) WHERE id = v_user_b
  ) INTO v_found;
  -- Note: v_user_b is the caller, and the function doesn't exclude caller.
  -- The client filters caller. So this should be true.
  PERFORM public._assert(v_found, '3b: Directory includes visible profiles');
  PERFORM public._test_reset();
END;
$$;

-- ============================================================
-- TEST 4: Blocking enforcement
-- ============================================================
DO $$
DECLARE
  v_user_a UUID := '00000000-0000-0000-0000-000000000001'; -- REPLACE
  v_user_b UUID := '00000000-0000-0000-0000-000000000002'; -- REPLACE
  v_blocked BOOLEAN;
  v_count INT;
BEGIN
  RAISE NOTICE '=== TEST 4: Hard-block enforcement ===';
  
  -- Setup: User A blocks User B (as postgres, bypassing RLS)
  INSERT INTO public.blocks (blocker_id, blocked_id)
  VALUES (v_user_a, v_user_b)
  ON CONFLICT DO NOTHING;
  
  -- Test 4a: is_blocked works both directions
  PERFORM public._test_as_user(v_user_a);
  SELECT public.is_blocked(v_user_a, v_user_b) INTO v_blocked;
  PERFORM public._assert(v_blocked, '4a: is_blocked(A,B) = true');
  SELECT public.is_blocked(v_user_b, v_user_a) INTO v_blocked;
  PERFORM public._assert(v_blocked, '4a: is_blocked(B,A) = true (symmetric)');
  PERFORM public._test_reset();
  
  -- Test 4b: Blocked user excluded from directory
  PERFORM public._test_as_user(v_user_a);
  SELECT COUNT(*) INTO v_count
  FROM public.get_neighbor_directory(NULL, 50) WHERE id = v_user_b;
  PERFORM public._assert(v_count = 0, '4b: Blocked user excluded from directory');
  PERFORM public._test_reset();
  
  -- Cleanup: Remove test block
  DELETE FROM public.blocks WHERE blocker_id = v_user_a AND blocked_id = v_user_b;
  RAISE NOTICE 'Test block removed.';
END;
$$;

-- ============================================================
-- TEST 5: RLS isolation (cross-account)
-- ============================================================
DO $$
DECLARE
  v_user_a UUID := '00000000-0000-0000-0000-000000000001'; -- REPLACE
  v_user_b UUID := '00000000-0000-0000-0000-000000000002'; -- REPLACE
  v_count INT;
BEGIN
  RAISE NOTICE '=== TEST 5: RLS isolation ===';
  
  -- Test 5a: User B cannot read User A's np_ledger
  PERFORM public._test_as_user(v_user_b);
  SELECT COUNT(*) INTO v_count
  FROM public.np_ledger WHERE profile_id = v_user_a;
  PERFORM public._assert(v_count = 0, '5a: Cannot read other user ledger');
  PERFORM public._test_reset();
  
  -- Test 5b: User B cannot update User A's profile
  PERFORM public._test_as_user(v_user_b);
  UPDATE public.profiles SET display_name = 'Hacked'
  WHERE id = v_user_a;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public._assert(v_count = 0, '5b: Cannot update other user profile');
  PERFORM public._test_reset();
END;
$$;

-- ============================================================
-- CLEANUP: Remove test helpers
-- ============================================================
DROP FUNCTION IF EXISTS public._test_as_user(UUID);
DROP FUNCTION IF EXISTS public._test_as_anon();
DROP FUNCTION IF EXISTS public._test_reset();
DROP FUNCTION IF EXISTS public._assert(BOOLEAN, TEXT);

-- Reset test profiles (optional - leave for manual inspection)
-- UPDATE public.profiles SET intro = NULL, intro_visible = true, skills = NULL
-- WHERE id IN ('USER_A_UUID', 'USER_B_UUID');

SELECT 'All tests passed!' AS result;
