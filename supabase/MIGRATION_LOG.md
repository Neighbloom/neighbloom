# Supabase Migration Log

## Milestone 1 — Applied via Dashboard SQL Editor

**Date:** 2026-10-11 (pending user execution)
**Method:** Supabase Dashboard → SQL Editor → paste `supabase/APPLY_VIA_DASHBOARD.sql`
**Applied by:** User (manual)

### Migrations applied:
1. `20261011000001_core_tables.sql` — profiles, posts, replies tables + indexes + triggers
2. `20261011000002_rls_policies.sql` — Row Level Security policies (public read, owner-only write)
3. `20261011000003_protect_np.sql` — NP column protection trigger + revoked award_np()

### Tracking note:
These were applied via SQL Editor, which does NOT populate the `supabase_migrations.schema_migrations` table. The migration files in `supabase/migrations/` are the source of truth. All migrations are idempotent (IF NOT EXISTS / DROP IF EXISTS), so future `supabase db push` will succeed as no-ops for these versions.

### Future (Milestone 2+):
Transition to CLI-tracked migrations. Options:
- User installs Supabase CLI locally and runs `supabase db push` (recommended)
- Or continue with SQL Editor + update this log (simpler, less tracking)

## Test Results

### Vitest (20 tests) — 2026-10-11
All passing. Covers: normalizeText, containsLink, maskPhones, buildRecTitle, badgeFor, timeAgo.

### Playwright (4 tests) — 2026-10-11
All passing. Covers: message-first composer (no template chips), draft autosave/restoration, helper count visibility, rec category selector.

### SQL Negative Authorization Tests — PENDING
Run `supabase/tests/rls_negative_tests.sql` after migrations are applied. See test file for 11 test cases.
