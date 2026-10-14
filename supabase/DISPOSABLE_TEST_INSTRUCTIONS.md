# Database Testing — Quick Guide

## Option 1: Automated CI (Recommended, $0)

**Push to `felix/m1-auth-posts` triggers automatic migration tests.**

The workflow `.github/workflows/test-migrations.yml`:
1. Spins up PostgreSQL 15 (GitHub-hosted, free)
2. Applies M1 baseline
3. Applies M2 migrations
4. Tests idempotency (reruns M2)
5. Runs the 22-test suite with proper RLS context switching
6. Verifies cleanup

**Results:** Check the Actions tab on GitHub after pushing. Green check = migrations work.

**No manual work required.** This runs on every push that touches `supabase/`.

## Option 2: Disposable Supabase Project (Manual, $0)

If CI isn't available or you want to test with real Supabase Auth:

1. **Create project:** https://supabase.com/dashboard → New Project
   - Name: `neighbloom-m2-test`, Plan: Free, ~2 min

2. **Apply M1:** SQL Editor → paste `supabase/APPLY_VIA_DASHBOARD.sql` → Run

3. **Apply M2:** SQL Editor → paste `supabase/APPLY_M2_VIA_DASHBOARD.sql` → Run
   - Expected: "Success. No rows returned."

4. **Create users:** Authentication → Add user (×2)
   - `test-a@neighbloom.test` / `Test123456!`
   - `test-b@neighbloom.test` / `Test123456!`
   - Note their UUIDs

5. **Run tests:** SQL Editor → paste `supabase/TEST_M2_MIGRATIONS.sql`
   - Replace `00000000-0000-0000-0000-000000000001` with User A's UUID
   - Replace `00000000-0000-0000-0000-000000000002` with User B's UUID
   - Run → "All tests passed!" at end = success
   - Any `TEST FAILED` error = stop, report to Felix

6. **Cleanup:** Project Settings → Delete Project

**Time:** ~30 minutes. **Cost:** $0.

## Test Coverage

| Category | Tests | What it verifies |
|----------|-------|------------------|
| Privacy | 4 | Hidden intros invisible via view, table, directory; owner sees own |
| Helper counts | 2 | Anon/auth can get public counts |
| Directory | 2 | Excludes hidden profiles |
| Blocking | 3 | Symmetric check, directory exclusion |
| RLS isolation | 2 | Cannot read other's ledger, cannot update other's profile |

All tests use `_test_as_user()` to properly simulate RLS contexts.
Failed assertions raise exceptions, stopping the run immediately.
