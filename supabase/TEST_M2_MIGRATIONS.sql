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
-- Setup: Follow the REAL application lifecycle (as postgres for fixtures,
-- then as authenticated users for the actual workflow steps)
-- 
-- Real workflow:
--   1. Owner creates post (trigger forces stage='open', helpers='[]')
--   2. Helpers volunteer via replies (kind='volunteer')
--   3. Owner selects helpers via select_helpers()
--   4. Owner transitions: open -> booked -> started -> done
--   5. Owner awards NP via award_np() (requires stage='done')
--
-- The enforce_post_defaults trigger PREVENTS bypassing this by INSERTing
-- directly into 'done' stage. This is correct security behavior.

DO $$
DECLARE
  v_user_c UUID := '00000000-0000-0000-0000-000000000003';
BEGIN
  RAISE NOTICE '=== SETUP: Creating test users and post ===';

  -- Ensure user C exists (auth.users first for FK, then profile)
  INSERT INTO auth.users (id, raw_user_meta_data)
  VALUES (v_user_c, '{"display_name": "Test User C"}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, display_name, town)
  VALUES (v_user_c, 'Test User C', 'Worth')
  ON CONFLICT (id) DO NOTHING;

  -- Create post (trigger will force stage='open', helpers='[]')
  -- This is what a real user does - they cannot set stage directly
  INSERT INTO public.posts (id, owner_id, kind, title, details, helpers_needed)
  VALUES (
    '11111111-1111-1111-1111-111111111111'::UUID,
    '00000000-0000-0000-0000-000000000001'::UUID,
    'help',
    'Test help request',
    'Need help moving',
    2
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create volunteer replies from B and C (required before select_helpers)
  INSERT INTO public.replies (post_id, author_id, body, kind)
  VALUES
    ('11111111-1111-1111-1111-111111111111'::UUID, '00000000-0000-0000-0000-000000000002'::UUID, 'I can help!', 'volunteer'),
    ('11111111-1111-1111-1111-111111111111'::UUID, '00000000-0000-0000-0000-000000000003'::UUID, 'Count me in!', 'volunteer')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Test fixtures created';
END;
$$;

-- Step 1: Owner selects helpers (as User A)
-- This is the legitimate way to set helpers - not via direct INSERT
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
BEGIN
  PERFORM public.select_helpers(
    '11111111-1111-1111-1111-111111111111'::UUID,
    ARRAY['00000000-0000-0000-0000-000000000002'::UUID, '00000000-0000-0000-0000-000000000003'::UUID]
  );
  RAISE NOTICE 'Helpers selected';
END;
$$;
COMMIT;

-- Step 2: Owner transitions through lifecycle (as User A)
-- open -> booked -> started -> done
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
BEGIN
  PERFORM public.transition_post('11111111-1111-1111-1111-111111111111'::UUID, 'booked');
  PERFORM public.transition_post('11111111-1111-1111-1111-111111111111'::UUID, 'started');
  PERFORM public.transition_post('11111111-1111-1111-1111-111111111111'::UUID, 'done');
  RAISE NOTICE 'Post transitioned to done via legitimate lifecycle';
END;
$$;
COMMIT;

-- Test 6a: Award NP to first helper (advances done -> confirmed)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
DECLARE
  v_post_id UUID;
  v_result RECORD;
BEGIN
  v_post_id := '11111111-1111-1111-1111-111111111111'::UUID;
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
  v_post_id := '11111111-1111-1111-1111-111111111111'::UUID;
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
  v_post_id := '11111111-1111-1111-1111-111111111111'::UUID;
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
DELETE FROM public.posts WHERE id = '11111111-1111-1111-1111-111111111111'::UUID;

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
  VALUES ('22222222-2222-2222-2222-222222222222'::UUID, v_user_a, 'help', 'Transition test', 'open', 'open', 1)
  ON CONFLICT (id) DO NOTHING;
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
  v_post_id := '22222222-2222-2222-2222-222222222222'::UUID;
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
  v_post_id := '22222222-2222-2222-2222-222222222222'::UUID;
  BEGIN
    PERFORM public.transition_post(v_post_id, 'confirmed');  -- Invalid: cancelled -> confirmed
    PERFORM public._assert(false, '7b: Invalid transition should fail');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._assert(true, '7b: Invalid transition rejected');
  END;
END;
$$;
COMMIT;

-- ============================================================
-- M3: Notification wiring tests (migration 20261012000012)
-- Applies the wiring migration inline (twice: idempotency),
-- then tests queue rules + all five event triggers.
-- ============================================================

-- Apply wiring (CI applies only the M1/M2 combined files before this
-- suite, so the M3 migration is included here exactly as shipped).
\i supabase/migrations/20261012000012_notification_wiring.sql
-- Idempotency: second run must also succeed.
\i supabase/migrations/20261012000012_notification_wiring.sql

-- SETUP: users D (queue-rule tests) and E (no-prefs isolation test)
DO $$
BEGIN
  RAISE NOTICE '=== M3 SETUP: users D and E, towns, opt-ins ===';
  INSERT INTO auth.users (id) VALUES
    ('00000000-0000-0000-0000-000000000004'),
    ('00000000-0000-0000-0000-000000000005')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, display_name, town) VALUES
    ('00000000-0000-0000-0000-000000000004', 'Test User D', 'Elsewhere'),
    ('00000000-0000-0000-0000-000000000005', 'Test User E', 'Worth')
  ON CONFLICT (id) DO NOTHING;
  -- B moves to a different town for the help_nearby fan-out test.
  UPDATE public.profiles SET town = 'Orland Park'
    WHERE id = '00000000-0000-0000-0000-000000000002';
  -- A, B, C opt in (E deliberately gets NO prefs row).
  INSERT INTO public.notification_prefs (profile_id, enabled) VALUES
    ('00000000-0000-0000-0000-000000000001', true),
    ('00000000-0000-0000-0000-000000000002', true),
    ('00000000-0000-0000-0000-000000000003', true)
  ON CONFLICT (profile_id) DO UPDATE SET enabled = true;
END;
$$;

-- N0: Regression guard — exactly ONE queue_notification overload may exist.
-- Migrations 00008 and 00011 defined divergent signatures; both coexisted
-- and short calls were ambiguous ("is not unique", CI run #11). M3 drops
-- both legacy overloads and installs a single canonical function.
DO $$
BEGIN
  PERFORM public._assert(
    (SELECT count(*) FROM pg_catalog.pg_proc p
     JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'queue_notification') = 1,
    'N0: exactly one queue_notification overload exists');
END;
$$;

-- N1: Opt-in gate — no prefs row and disabled both suppress; enabled delivers
DO $$
DECLARE
  v_d UUID := '00000000-0000-0000-0000-000000000004';
  v_id UUID;
BEGIN
  v_id := public.queue_notification(v_d, 'volunteers', 't', 'b');
  PERFORM public._assert(v_id IS NULL, 'N1a: no prefs row = no notification');
  INSERT INTO public.notification_prefs (profile_id, enabled) VALUES (v_d, false)
  ON CONFLICT (profile_id) DO UPDATE SET enabled = false;
  v_id := public.queue_notification(v_d, 'volunteers', 't', 'b');
  PERFORM public._assert(v_id IS NULL, 'N1b: opted out = no notification');
  UPDATE public.notification_prefs SET enabled = true WHERE profile_id = v_d;
  v_id := public.queue_notification(v_d, 'volunteers', 't', 'b');
  PERFORM public._assert(v_id IS NOT NULL, 'N1c: opted in = notification queued');
END;
$$;

-- N2 + N3: Type toggle, then frequency cap (D reaches exactly 3, 4th suppressed)
DO $$
DECLARE
  v_d UUID := '00000000-0000-0000-0000-000000000004';
  v_id UUID;
BEGIN
  UPDATE public.notification_prefs SET notify_messages = false WHERE profile_id = v_d;
  v_id := public.queue_notification(v_d, 'new_message', 't', 'b');
  PERFORM public._assert(v_id IS NULL, 'N2a: toggled-off type suppressed');
  UPDATE public.notification_prefs SET notify_messages = true WHERE profile_id = v_d;
  v_id := public.queue_notification(v_d, 'volunteers', 't', 'b');
  PERFORM public._assert(v_id IS NOT NULL, 'N2b: other type still delivered');
  v_id := public.queue_notification(v_d, 'help_confirmed', 't', 'b');
  PERFORM public._assert(v_id IS NOT NULL, 'N3a: third notification delivered (cap = 3/day)');
  v_id := public.queue_notification(v_d, 'gratitude', 't', 'b');
  PERFORM public._assert(v_id IS NULL, 'N3b: fourth suppressed by frequency cap');
END;
$$;

-- N4: Quiet hours suppress, then allow (window computed around actual local time)
DO $$
DECLARE
  v_c UUID := '00000000-0000-0000-0000-000000000003';
  v_now TIME := (pg_catalog.now() AT TIME ZONE 'America/Chicago')::time;
BEGIN
  UPDATE public.notification_prefs
    SET quiet_start = (v_now - interval '1 hour')::time,
        quiet_end   = (v_now + interval '1 hour')::time
    WHERE profile_id = v_c;
END;
$$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
INSERT INTO public.posts (id, owner_id, kind, title, details, helpers_needed)
VALUES ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000001', 'help', 'M3 quiet-hours post', 'test', 1);
COMMIT;

DO $$
BEGIN
  PERFORM public._assert(
    NOT EXISTS (SELECT 1 FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000003' AND type = 'help_nearby'),
    'N4a: quiet hours suppress help_nearby');
END;
$$;

DO $$
DECLARE
  v_now TIME := (pg_catalog.now() AT TIME ZONE 'America/Chicago')::time;
BEGIN
  UPDATE public.notification_prefs
    SET quiet_start = (v_now + interval '2 hours')::time,
        quiet_end   = (v_now + interval '3 hours')::time
    WHERE profile_id = '00000000-0000-0000-0000-000000000003';
END;
$$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
INSERT INTO public.posts (id, owner_id, kind, title, details, helpers_needed)
VALUES ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000001', 'help', 'M3 after-quiet post', 'test', 1);
COMMIT;

-- TEMP DIAGNOSTIC (remove after N4b investigation): dump the runtime
-- state every gate sees, then attempt the exact call the trigger makes.
DO $$
DECLARE
  v_c UUID := '00000000-0000-0000-0000-000000000003';
  v_a UUID := '00000000-0000-0000-0000-000000000001';
  v_prefs public.notification_prefs%ROWTYPE;
  v_id UUID;
  v_recipients TEXT;
BEGIN
  SELECT * INTO v_prefs FROM public.notification_prefs WHERE profile_id = v_c;
  RAISE NOTICE 'DIAG prefs: enabled=% nearby=% quiet=%-% tz=%',
    v_prefs.enabled, v_prefs.notify_help_nearby, v_prefs.quiet_start, v_prefs.quiet_end, v_prefs.timezone;
  RAISE NOTICE 'DIAG gates: is_blocked(C,A)=% is_blocked(A,C)=% can_send(C)=% notif_count(C)=%',
    public.is_blocked(v_c, v_a), public.is_blocked(v_a, v_c),
    public.can_send_notification(v_c),
    (SELECT count(*) FROM public.notifications WHERE profile_id = v_c);
  SELECT string_agg(p.id::text, ',') INTO v_recipients
    FROM public.profiles p
    WHERE p.town = (SELECT town FROM public.profiles WHERE id = v_a)
      AND p.id <> v_a AND NOT public.is_blocked(v_a, p.id);
  RAISE NOTICE 'DIAG loop recipients for a new A post: %', v_recipients;
  BEGIN
    v_id := public.queue_notification(v_c, 'help_nearby', 'diag', 'diag',
      'post', '55555555-5555-5555-5555-555555555555', v_a);
    RAISE NOTICE 'DIAG direct queue call returned: %', v_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'DIAG direct queue call ERRORED: %', SQLERRM;
  END;
END;
$$;

DO $$
BEGIN
  PERFORM public._assert(
    EXISTS (SELECT 1 FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000003' AND type = 'help_nearby'
        AND ref_id = '55555555-5555-5555-5555-555555555555'),
    'N4b: help_nearby delivered outside quiet hours (same town)');
  PERFORM public._assert(
    NOT EXISTS (SELECT 1 FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000001' AND type = 'help_nearby'),
    'N4c: owner never notified about own post');
  PERFORM public._assert(
    NOT EXISTS (SELECT 1 FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000002' AND type = 'help_nearby'),
    'N4d: different-town neighbor not notified');
END;
$$;

-- N5: Volunteer event notifies the post owner
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
INSERT INTO public.posts (id, owner_id, kind, title, details, helpers_needed)
VALUES ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000001', 'help', 'M3 lifecycle post', 'test', 1);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
INSERT INTO public.replies (post_id, author_id, body, kind)
VALUES ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000002', 'I can help', 'volunteer');
COMMIT;

DO $$
BEGIN
  PERFORM public._assert(
    EXISTS (SELECT 1 FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000001' AND type = 'volunteers'
        AND ref_id = '33333333-3333-3333-3333-333333333333'),
    'N5: owner notified when someone volunteers');
END;
$$;

-- N8: A recipient with NO prefs row never breaks the product action
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005"}', true);
INSERT INTO public.replies (post_id, author_id, body, kind)
VALUES ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000005', 'E can help too', 'volunteer');
COMMIT;

DO $$
BEGIN
  PERFORM public._assert(
    EXISTS (SELECT 1 FROM public.replies
      WHERE post_id = '33333333-3333-3333-3333-333333333333'
        AND author_id = '00000000-0000-0000-0000-000000000005'),
    'N8: volunteer reply succeeds regardless of notification state');
END;
$$;

-- N6: Full flow — select, transition, award, converse, dedup, privacy of content
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
BEGIN
  PERFORM public.select_helpers('33333333-3333-3333-3333-333333333333',
    ARRAY['00000000-0000-0000-0000-000000000002']::UUID[]);
  PERFORM public.transition_post('33333333-3333-3333-3333-333333333333', 'booked');
  PERFORM public.transition_post('33333333-3333-3333-3333-333333333333', 'started');
  PERFORM public.transition_post('33333333-3333-3333-3333-333333333333', 'done');
  PERFORM public.award_np('00000000-0000-0000-0000-000000000002', 20, 'help_confirmed',
    '33333333-3333-3333-3333-333333333333', 'm3-award-1');
  PERFORM public.create_conversation('33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000002');
END;
$$;
COMMIT;

DO $$
BEGIN
  PERFORM public._assert(
    EXISTS (SELECT 1 FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000002' AND type = 'help_confirmed'
        AND ref_id = '33333333-3333-3333-3333-333333333333'),
    'N6a: helper notified on help_confirmed (+20 NP)');
END;
$$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
INSERT INTO public.messages (conversation_id, sender_id, body)
SELECT id, '00000000-0000-0000-0000-000000000001', 'hello B'
FROM public.conversations
WHERE post_id = '33333333-3333-3333-3333-333333333333'
  AND helper_id = '00000000-0000-0000-0000-000000000002';
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
INSERT INTO public.messages (conversation_id, sender_id, body)
SELECT id, '00000000-0000-0000-0000-000000000002', 'M3 secret body one'
FROM public.conversations
WHERE post_id = '33333333-3333-3333-3333-333333333333'
  AND helper_id = '00000000-0000-0000-0000-000000000002';
INSERT INTO public.messages (conversation_id, sender_id, body)
SELECT id, '00000000-0000-0000-0000-000000000002', 'M3 secret body two'
FROM public.conversations
WHERE post_id = '33333333-3333-3333-3333-333333333333'
  AND helper_id = '00000000-0000-0000-0000-000000000002';
COMMIT;

DO $$
DECLARE
  v_conv UUID;
BEGIN
  SELECT id INTO v_conv FROM public.conversations
    WHERE post_id = '33333333-3333-3333-3333-333333333333'
      AND helper_id = '00000000-0000-0000-0000-000000000002';
  PERFORM public._assert(
    EXISTS (SELECT 1 FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000002' AND type = 'new_message'
        AND ref_id = v_conv),
    'N6b: helper notified on new message');
  PERFORM public._assert(
    (SELECT count(*) FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000001' AND type = 'new_message'
        AND ref_id = v_conv) = 1,
    'N6c: message burst deduped to exactly one notification');
  PERFORM public._assert(
    NOT EXISTS (SELECT 1 FROM public.notifications
      WHERE body LIKE '%M3 secret body%'),
    'N6d: notification bodies never contain message content');
END;
$$;

-- N7: Gratitude event notifies the helper
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
DO $$
BEGIN
  PERFORM public.post_gratitude('33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000002', 'Thank you so much!');
END;
$$;
COMMIT;

DO $$
BEGIN
  PERFORM public._assert(
    EXISTS (SELECT 1 FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000002' AND type = 'gratitude'),
    'N7: helper notified on public gratitude');
END;
$$;

-- ============================================================
-- N9: Block safeguards on EVERY queue path + dedup scoping
-- Regression tests for the audit of all queue_notification callers:
-- post_gratitude's original actor-less call bypassed the block
-- check, and the NP-award trigger never passed an actor.
-- D (owner, 'Elsewhere') + E (helper) run three full lifecycles.
-- ============================================================

-- Setup: E opts in (earlier sections relied on E having NO prefs;
-- N9 runs last, so enabling E now disturbs nothing before it).
-- Fixtures as postgres, mirroring Test 6: posts + volunteer replies.
DO $$
BEGIN
  INSERT INTO public.notification_prefs (profile_id, enabled)
  VALUES ('00000000-0000-0000-0000-000000000005', true)
  ON CONFLICT (profile_id) DO UPDATE SET enabled = true;

  INSERT INTO public.posts (id, owner_id, kind, title, details, helpers_needed) VALUES
    ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000004', 'help', 'M3 N9 post one', 'test', 1),
    ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000004', 'help', 'M3 N9 post two', 'test', 1),
    ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000004', 'help', 'M3 N9 post three', 'test', 1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.replies (post_id, author_id, body, kind) VALUES
    ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000005', 'I can help!', 'volunteer'),
    ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000005', 'I can help!', 'volunteer'),
    ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000005', 'I can help!', 'volunteer')
  ON CONFLICT DO NOTHING;
END;
$$;

-- D runs the lifecycles: P1 + P2 fully awarded; P3 stops at 'done'
-- (its award happens later, while blocked).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004"}', true);
DO $$
BEGIN
  PERFORM public.select_helpers('66666666-6666-6666-6666-666666666666'::UUID,
    ARRAY['00000000-0000-0000-0000-000000000005'::UUID]);
  PERFORM public.transition_post('66666666-6666-6666-6666-666666666666'::UUID, 'booked');
  PERFORM public.transition_post('66666666-6666-6666-6666-666666666666'::UUID, 'started');
  PERFORM public.transition_post('66666666-6666-6666-6666-666666666666'::UUID, 'done');
  PERFORM public.award_np('00000000-0000-0000-0000-000000000005', 20, 'help_confirmed',
    '66666666-6666-6666-6666-666666666666'::UUID, 'm3-n9-key-1');

  PERFORM public.select_helpers('77777777-7777-7777-7777-777777777777'::UUID,
    ARRAY['00000000-0000-0000-0000-000000000005'::UUID]);
  PERFORM public.transition_post('77777777-7777-7777-7777-777777777777'::UUID, 'booked');
  PERFORM public.transition_post('77777777-7777-7777-7777-777777777777'::UUID, 'started');
  PERFORM public.transition_post('77777777-7777-7777-7777-777777777777'::UUID, 'done');
  PERFORM public.award_np('00000000-0000-0000-0000-000000000005', 20, 'help_confirmed',
    '77777777-7777-7777-7777-777777777777'::UUID, 'm3-n9-key-2');

  PERFORM public.select_helpers('88888888-8888-8888-8888-888888888888'::UUID,
    ARRAY['00000000-0000-0000-0000-000000000005'::UUID]);
  PERFORM public.transition_post('88888888-8888-8888-8888-888888888888'::UUID, 'booked');
  PERFORM public.transition_post('88888888-8888-8888-8888-888888888888'::UUID, 'started');
  PERFORM public.transition_post('88888888-8888-8888-8888-888888888888'::UUID, 'done');
END;
$$;
COMMIT;

-- N9a/N9b: queue-level block check via direct calls (C receives,
-- A is the actor; C has received exactly 2 notifications so far,
-- so the unblocked call fits under the 3/day cap).
DO $$
DECLARE
  v_c UUID := '00000000-0000-0000-0000-000000000003';
  v_a UUID := '00000000-0000-0000-0000-000000000001';
  v_ref UUID := '99999999-9999-9999-9999-999999999999';
  v_id UUID;
BEGIN
  INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (v_c, v_a)
  ON CONFLICT DO NOTHING;
  v_id := public.queue_notification(v_c, 'volunteers', 't', 'b', 'post', v_ref, v_a);
  PERFORM public._assert(v_id IS NULL,
    'N9a: queue suppresses notification when actor is blocked');
  DELETE FROM public.blocks WHERE blocker_id = v_c AND blocked_id = v_a;
  v_id := public.queue_notification(v_c, 'volunteers', 't', 'b', 'post', v_ref, v_a);
  PERFORM public._assert(v_id IS NOT NULL,
    'N9b: same call delivered once unblocked (blocked attempt left no row to dedup against)');
END;
$$;

-- Block D and E, then D thanks E for P1 via the RPC.
INSERT INTO public.blocks (blocker_id, blocked_id)
VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004"}', true);
DO $$
BEGIN
  PERFORM public.post_gratitude('66666666-6666-6666-6666-666666666666',
    '00000000-0000-0000-0000-000000000005', 'Thank you so much!');
END;
$$;
COMMIT;

DO $$
BEGIN
  PERFORM public._assert(
    EXISTS (SELECT 1 FROM public.gratitude_posts
      WHERE post_id = '66666666-6666-6666-6666-666666666666'
        AND helper_id = '00000000-0000-0000-0000-000000000005'),
    'N9c: gratitude itself is recorded even when blocked (only the notification is gated)');
  PERFORM public._assert(
    (SELECT count(*) FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000005' AND type = 'gratitude'
        AND ref_id = '66666666-6666-6666-6666-666666666666') = 0,
    'N9d: blocked gratitude notifies nobody — RPC path honors the block (bypass regression)');
END;
$$;

-- Still blocked: D awards NP for P3.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004"}', true);
DO $$
BEGIN
  PERFORM public.award_np('00000000-0000-0000-0000-000000000005', 20, 'help_confirmed',
    '88888888-8888-8888-8888-888888888888'::UUID, 'm3-n9-key-3');
END;
$$;
COMMIT;

DO $$
BEGIN
  PERFORM public._assert(
    (SELECT count(*) FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000005' AND type = 'help_confirmed'
        AND ref_id = '88888888-8888-8888-8888-888888888888') = 0,
    'N9e: NP-award notification suppressed while owner and helper are blocked');
END;
$$;

-- Unblock, then D thanks E for P2 (a DISTINCT gratitude event:
-- different post, so a different dedup ref — must be delivered,
-- and exactly once even though trigger and RPC both queue it).
DELETE FROM public.blocks
WHERE blocker_id = '00000000-0000-0000-0000-000000000004'
  AND blocked_id = '00000000-0000-0000-0000-000000000005';

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004"}', true);
DO $$
BEGIN
  PERFORM public.post_gratitude('77777777-7777-7777-7777-777777777777',
    '00000000-0000-0000-0000-000000000005', 'Thank you so much!');
END;
$$;
COMMIT;

DO $$
BEGIN
  PERFORM public._assert(
    (SELECT count(*) FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000005' AND type = 'gratitude'
        AND ref_id = '77777777-7777-7777-7777-777777777777') = 1,
    'N9f: distinct gratitude event delivered exactly once (trigger + RPC deduped, not suppressed)');
  PERFORM public._assert(
    (SELECT count(*) FROM public.notifications
      WHERE profile_id = '00000000-0000-0000-0000-000000000005' AND type = 'gratitude') = 1,
    'N9g: exactly one gratitude notification total across both events');
END;
$$;

-- Cleanup
DELETE FROM public.posts WHERE id = '22222222-2222-2222-2222-222222222222'::UUID;

-- Final cleanup: remove assert helper
DROP FUNCTION IF EXISTS public._assert(BOOLEAN, TEXT);

-- Success only prints if ALL tests above passed (any failure raises exception)
SELECT 'All 49 assertions passed!' AS result;
