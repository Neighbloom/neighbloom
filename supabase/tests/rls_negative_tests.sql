-- Milestone 1: Negative authorization tests for RLS + NP protection.
--
-- Run these AFTER applying migrations, as an authenticated test user.
-- Each test expects a specific denial. If any test SUCCEEDS when it should
-- fail, the security model is broken.
--
-- Setup: create two test users via Supabase Auth, note their UUIDs as
-- TEST_USER_A and TEST_USER_B. Run each block as the respective user
-- (use SET LOCAL role or test via the Supabase client with their JWT).

-- TEST 1: User cannot directly increase their own NP ----------------------
-- Expected: ERROR "Direct NP modification is not allowed"
-- UPDATE profiles SET np = 999999 WHERE id = auth.uid();

-- TEST 2: User cannot decrease another user's NP ---------------------------
-- Expected: 0 rows affected (RLS USING clause filters to own row only)
-- UPDATE profiles SET np = 0 WHERE id = '<TEST_USER_B_UUID>';

-- TEST 3: User cannot change np via a crafted update of other columns -----
-- Expected: ERROR "Direct NP modification is not allowed"
-- UPDATE profiles SET display_name = 'Hacker', np = 5000 WHERE id = auth.uid();

-- TEST 4: User cannot delete their profile to reset NP --------------------
-- Expected: ERROR or 0 rows (no DELETE policy exists on profiles)
-- DELETE FROM profiles WHERE id = auth.uid();

-- TEST 5: User cannot insert a second profile with high NP ----------------
-- Expected: ERROR (no INSERT policy for authenticated users)
-- INSERT INTO profiles (id, display_name, np) VALUES (auth.uid(), 'Alt', 99999);

-- TEST 6: User A cannot edit User B's post --------------------------------
-- Expected: 0 rows affected
-- UPDATE posts SET title = 'Hacked' WHERE id = '<USER_B_POST_UUID>';

-- TEST 7: User A cannot delete User B's post -------------------------------
-- Expected: 0 rows affected
-- DELETE FROM posts WHERE id = '<USER_B_POST_UUID>';

-- TEST 8: Anonymous user cannot create a post ------------------------------
-- Expected: ERROR (no anon INSERT policy; WITH CHECK requires auth.uid())
-- (Run without authentication)
-- INSERT INTO posts (owner_id, kind, title) VALUES (gen_random_uuid(), 'help', 'Spam');

-- TEST 9: User cannot set owner_id to another user on insert ---------------
-- Expected: ERROR (WITH CHECK requires auth.uid() = owner_id)
-- INSERT INTO posts (owner_id, kind, title)
-- VALUES ('<TEST_USER_B_UUID>', 'help', 'Impersonation attempt');

-- TEST 10: award_np function does not exist --------------------------------
-- Expected: ERROR "function award_np does not exist"
-- (Milestone 1 does not implement NP awards; no executable reward function)
-- SELECT award_np(auth.uid(), 20);

-- TEST 11: User cannot modify post stage directly ---------------------------
-- Expected: ERROR "Direct stage modification is not allowed"
-- UPDATE posts SET stage = 'done' WHERE id = '<OWN_POST_UUID>';

-- TEST 12: User cannot modify post helpers directly --------------------------
-- Expected: ERROR "Direct helpers modification is not allowed"
-- UPDATE posts SET helpers = '[{"id": "fake"}]' WHERE id = '<OWN_POST_UUID>';

-- TEST 13: User CAN update legitimate post fields ------------------------------
-- Expected: SUCCEEDS (title, details, area are user-editable)
-- UPDATE posts SET title = 'Updated title' WHERE id = '<OWN_POST_UUID>';

-- TEST 14: System fields forced to defaults on INSERT -------------------------
-- Expected: stage='open', status='open', helpers='[]' regardless of input
-- INSERT INTO posts (owner_id, kind, title, stage, status, helpers)
-- VALUES (auth.uid(), 'help', 'Test', 'done', 'done', '[{"id":"x"}]')
-- RETURNING stage, status, helpers;
-- Verify returned values are 'open', 'open', '[]'.
