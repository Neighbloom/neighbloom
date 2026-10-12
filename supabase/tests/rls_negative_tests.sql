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

-- TEST 10: award_np works when called (trusted path) -----------------------
-- Expected: SUCCEEDS (this is the legitimate server-side path)
-- SELECT award_np(auth.uid(), 20);
-- Then verify: SELECT np FROM profiles WHERE id = auth.uid(); -- increased by 20
