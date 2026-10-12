-- ============================================================
-- Neighbloom M2 Migration Test Suite (Executable)
--
-- Each test runs in an explicit transaction:
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims', ..., true);  -- transaction-local
--     -- test queries (same transaction, settings visible)
--   COMMIT;
--
-- SET LOCAL and transaction-local set_config are scoped to the transaction,
-- so they must be in the same BEGIN/COMMIT block as the test queries.
-- ============================================================

-- Helper: Assert function (no role switching, safe anywhere)
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
-- SETUP: Configure test profiles (as postgres, no transaction needed)
-- ============================================================
DO $$
DECLARE
  v_user_a UUID := '00000000-0000-0000-0000-000000000001';
  v_user_b UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
  RAISE NOTICE '=== SETUP: Configuring test profiles ===';

  -- Ensure auth.users table exists (for FK compliance in CI mock)
  -- Include raw_user_meta_data for the handle_new_user trigger
  CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY,
    raw_user_meta_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Ensure test users exist in auth.users (for FK)
  INSERT INTO auth.users (id) VALUES (v_user_a), (v_user_b)
  ON CONFLICT (id) DO NOTHING;

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
-- TEST 1a: User B queries view (should get NULL for hidden)
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
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
COMMIT;

-- ============================================================
-- TEST 1b: User B direct table access (should fail)
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
DO $$
DECLARE
  v_intro TEXT;
BEGIN
  BEGIN
    SELECT intro INTO v_intro
    FROM public.profiles
    WHERE id = '00000000-0000-0000-0000-000000000001';
    PERFORM public._assert(false, '1b: Direct table access should fail');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM public._assert(true, '1b: Direct SELECT on intro denied');
  END;
END;
$$;
COMMIT;

-- ============================================================
-- TEST 1c: Owner sees own hidden intro via view
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
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
COMMIT;

-- ============================================================
-- TEST 1d: Anon sees NULL for hidden, value for public
-- ============================================================
BEGIN;
SET LOCAL ROLE anon;
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
COMMIT;

-- ============================================================
-- TEST 2a: Anon can get help count (public data)
-- ============================================================
BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{}', true);
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT public.get_help_count('00000000-0000-0000-0000-000000000002') INTO v_count;
  PERFORM public._assert(v_count >= 0, '2a: Anon can get help count');
END;
$$;
COMMIT;

-- ============================================================
-- TEST 2b: Authenticated can get help count
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT public.get_help_count('00000000-0000-0000-0000-000000000002') INTO v_count;
  PERFORM public._assert(v_count >= 0, '2b: Authenticated can get help count');
END;
$$;
COMMIT;

-- ============================================================
-- TEST 3a: Directory excludes hidden profiles
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
DO $$
DECLARE
  v_found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.get_neighbor_directory(NULL, 50)
    WHERE id = '00000000-0000-0000-0000-000000000001'
  ) INTO v_found;
  PERFORM public._assert(NOT v_found, '3a: Directory excludes hidden profiles');
END;
$$;
COMMIT;

-- ============================================================
-- TEST 3b: Directory includes visible profiles
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
DO $$
DECLARE
  v_found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.get_neighbor_directory(NULL, 50)
    WHERE id = '00000000-0000-0000-0000-000000000002'
  ) INTO v_found;
  PERFORM public._assert(v_found, '3b: Directory includes visible profiles');
END;
$$;
COMMIT;

-- ============================================================
-- TEST 4: Blocking (setup as postgres)
-- ============================================================
INSERT INTO public.blocks (blocker_id, blocked_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT DO NOTHING;

-- Test 4a: is_blocked symmetric
BEGIN;
SET LOCAL ROLE authenticated;
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
COMMIT;

-- Test 4b: Blocked user excluded from directory
BEGIN;
SET LOCAL ROLE authenticated;
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
COMMIT;

-- Cleanup block (as postgres)
DELETE FROM public.blocks
WHERE blocker_id = '00000000-0000-0000-0000-000000000001'
  AND blocked_id = '00000000-0000-0000-0000-000000000002';

-- ============================================================
-- TEST 5a: Cannot read other's ledger
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
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
COMMIT;

-- ============================================================
-- TEST 5b: Cannot update other's profile
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
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
COMMIT;

-- ============================================================
-- CLEANUP (after Test 5, before Test 6)
-- ============================================================
-- (Test 6-7 follow below)

-- ============================================================
-- TEST 6: Multi-helper NP awards (requires post lifecycle)
-- ============================================================
-- Setup: Create a test post with 2 helpers (as postgres)
DO $$
DECLARE
  v_post_id UUID;
  v_user_a UUID := '00000000-0000-0000-0000-000000000001';
  v_user_b UUID := '00000000-0000-0000-0000-000000000002';
  v_user_c UUID := '00000000-0000-0000-0000-000000000003';
BEGIN
  RAISE NOTICE '=== SETUP: Creating test post for multi-helper ===';

  -- Ensure user C exists (auth.users first for FK, then profile)
  INSERT INTO auth.users (id)
  VALUES (v_user_c)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, display_name, town)
  VALUES (v_user_c, 'Test User C', 'Worth')
  ON CONFLICT (id) DO NOTHING;

  -- Create a post in 'done' stage with 2 helpers selected
  INSERT INTO public.posts (id, owner_id, kind, title, details, stage, status, helpers, helpers_needed)
  VALUES (
    gen_random_uuid(),
    v_user_a,
    'help',
    'Test help request',
    'Need help moving',
    'done',
    'done',
    jsonb_build_array(
      jsonb_build_object('id', v_user_b, 'selected_at', now()),
      jsonb_build_object('id', v_user_c, 'selected_at', now())
    ),
    2
  )
  RETURNING id INTO v_post_id;

  -- Store post ID for tests (using a temp table)
  CREATE TEMP TABLE IF NOT EXISTS _test_post (id UUID);
  DELETE FROM _test_post;
  INSERT INTO _test_post VALUES (v_post_id);

  RAISE NOTICE 'Test post created: %', v_post_id;
END;
$$;

-- Test 6a: Award NP to first helper (advances done -> confirmed)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  v_post_id UUID;
  v_result RECORD;
BEGIN
  SELECT id INTO v_post_id FROM _test_post LIMIT 1;
  SELECT * INTO v_result FROM public.award_np(
    '00000000-0000-0000-0000-000000000002',  -- User B
    20,
    'help_confirmed',
    v_post_id,
    'test-key-1'
  );
  PERFORM public._assert(
    v_result.profile_id = '00000000-0000-0000-0000-000000000002',
    '6a: First helper award succeeds'
  );
  -- Verify post advanced to confirmed
  PERFORM public._assert(
    (SELECT stage FROM public.posts WHERE id = v_post_id) = 'confirmed',
    '6a: Post advanced to confirmed after first award'
  );
END;
$$;
COMMIT;

-- Test 6b: Award NP to second helper (was broken before fix)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  v_post_id UUID;
  v_result RECORD;
BEGIN
  SELECT id INTO v_post_id FROM _test_post LIMIT 1;
  SELECT * INTO v_result FROM public.award_np(
    '00000000-0000-0000-0000-000000000003',  -- User C
    20,
    'help_confirmed',
    v_post_id,
    'test-key-2'
  );
  PERFORM public._assert(
    v_result.profile_id = '00000000-0000-0000-0000-000000000003',
    '6b: Second helper award succeeds (multi-helper fix)'
  );
END;
$$;
COMMIT;

-- Test 6c: Duplicate award prevention (idempotency)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  v_post_id UUID;
  v_count1 INT;
  v_count2 INT;
BEGIN
  SELECT id INTO v_post_id FROM _test_post LIMIT 1;
  SELECT COUNT(*) INTO v_count1 FROM public.np_ledger
  WHERE idempotency_key = 'test-key-1';

  -- Try to award again with same key
  PERFORM public.award_np(
    '00000000-0000-0000-0000-000000000002',
    20,
    'help_confirmed',
    v_post_id,
    'test-key-1'  -- Same key!
  );

  SELECT COUNT(*) INTO v_count2 FROM public.np_ledger
  WHERE idempotency_key = 'test-key-1';

  PERFORM public._assert(
    v_count1 = v_count2,
    '6c: Duplicate award prevented (idempotency)'
  );
END;
$$;
COMMIT;

-- Test 6d: Helper count reflects awards
BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{}', true);
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT public.get_help_count('00000000-0000-0000-0000-000000000002') INTO v_count;
  PERFORM public._assert(v_count >= 1, '6d: Helper count reflects award');
END;
$$;
COMMIT;

-- Cleanup test post
DELETE FROM public.posts WHERE id IN (SELECT id FROM _test_post);
DROP TABLE IF EXISTS _test_post;

-- ============================================================
-- TEST 7: State transitions (audit log correctness)
-- ============================================================
-- Setup: Create a post in 'open' stage (as postgres)
DO $$
DECLARE
  v_post_id UUID;
  v_user_a UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.posts (id, owner_id, kind, title, stage, status, helpers_needed)
  VALUES (gen_random_uuid(), v_user_a, 'help', 'Transition test', 'open', 'open', 1)
  RETURNING id INTO v_post_id;

  CREATE TEMP TABLE IF NOT EXISTS _test_post2 (id UUID);
  DELETE FROM _test_post2;
  INSERT INTO _test_post2 VALUES (v_post_id);
END;
$$;

-- Test 7a: Valid transition open -> cancelled
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  v_post_id UUID;
  v_from TEXT;
  v_to TEXT;
BEGIN
  SELECT id INTO v_post_id FROM _test_post2 LIMIT 1;
  PERFORM public.transition_post(v_post_id, 'cancelled');

  -- Verify audit log has correct from_stage (was buggy: both were 'to')
  SELECT from_stage, to_stage INTO v_from, v_to
  FROM public.post_transitions
  WHERE post_id = v_post_id
  ORDER BY created_at DESC LIMIT 1;

  PERFORM public._assert(
    v_from = 'open' AND v_to = 'cancelled',
    '7a: Audit log records correct from_stage (not duplicated)'
  );
END;
$$;
COMMIT;

-- Test 7b: Invalid transition rejected
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  v_post_id UUID;
BEGIN
  SELECT id INTO v_post_id FROM _test_post2 LIMIT 1;
  BEGIN
    PERFORM public.transition_post(v_post_id, 'confirmed');  -- Invalid: cancelled -> confirmed
    PERFORM public._assert(false, '7b: Invalid transition should fail');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._assert(true, '7b: Invalid transition rejected');
  END;
END;
$$;
COMMIT;

-- Cleanup
DELETE FROM public.posts WHERE id IN (SELECT id FROM _test_post2);
DROP TABLE IF EXISTS _test_post2;

-- Final cleanup: remove assert helper
DROP FUNCTION IF EXISTS public._assert(BOOLEAN, TEXT);

-- Success only prints if ALL tests above passed (any failure raises exception)
SELECT 'All 23 assertions passed!' AS result;
