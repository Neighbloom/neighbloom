# Supabase Migration Log

## Milestone 1 — Applied via Dashboard SQL Editor

**Date:** 2026-10-11 (pending user execution)
**Method:** Supabase Dashboard → SQL Editor → paste `supabase/APPLY_VIA_DASHBOARD.sql`
**Applied by:** User (manual)
**Transaction:** Single atomic transaction (BEGIN/COMMIT wrapper)

### Migrations applied:
1. `20261011000001_core_tables.sql` — profiles, posts, replies tables + indexes + triggers (incl. `handle_new_user` on `auth.users`)
2. `20261011000002_rls_policies.sql` — Row Level Security policies (public read, owner-only write)
3. `20261011000003_protect_np.sql` — System field protection triggers (np, stage, status, helpers)

### Tracking note:
These were applied via SQL Editor, which does NOT populate the `supabase_migrations.schema_migrations` table. The migration files in `supabase/migrations/` are the source of truth. All migrations are idempotent (IF NOT EXISTS / OR REPLACE), so future `supabase db push` will succeed as no-ops for these versions.

## Migration History Reconciliation Plan

**Before the first CLI migration (Milestone 2+), execute:**

```bash
# 1. Link the project (one-time, requires database password)
npx supabase link --project-ref YOUR_PROJECT_REF

# 2. Mark M1 migrations as already applied (without re-running)
npx supabase migration repair --status applied \
  20261011000001 \
  20261011000002 \
  20261011000003

# 3. Verify the repair
npx supabase migration list

# 4. Future migrations will now track correctly via:
npx supabase db push
```

This uses Supabase's supported `migration repair` procedure to synchronize the remote history without re-executing the already-applied SQL.

## Test Results

### Vitest (20 tests) — 2026-10-11
All passing. Covers: normalizeText, containsLink, maskPhones, buildRecTitle, badgeFor, timeAgo.

### Playwright (4 tests) — 2026-10-11
All passing. Covers: message-first composer (no template chips), draft autosave/restoration, helper count visibility, rec category selector.

### Client Authorization Tests (13 tests) — PENDING
Run `node supabase/tests/authz_client_tests.mjs` after migrations are applied and credentials are configured. Tests the actual API attack surface via JS client.

### SQL Negative Authorization Tests (13 cases) — PENDING
See `supabase/tests/rls_negative_tests.sql`. For manual execution in SQL Editor if deeper verification is needed.
