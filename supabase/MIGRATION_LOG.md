# Supabase Migration Log

## Milestone 1 — Applied via Dashboard SQL Editor

**Date:** 2026-10-11
**Method:** Supabase Dashboard → SQL Editor → paste `supabase/APPLY_VIA_DASHBOARD.sql`
**Applied by:** User (manual)
**Result:** Success. No rows returned.
**Transaction:** Single atomic transaction (BEGIN/COMMIT wrapper)

### Project configuration:
- Plan: Free
- Region: East US (Ohio)
- Data API: Enabled
- Automatic table exposure: Disabled (explicit GRANTs in migration)
- Automatic RLS: Enabled

### Migrations applied:
1. `20261011000001_core_tables.sql` — profiles, posts, replies tables + indexes + triggers (incl. `handle_new_user` on `auth.users`)
2. `20261011000002_rls_policies.sql` — Row Level Security policies + least-privilege GRANTs
3. `20261011000003_protect_np.sql` — System field protection triggers (np, stage, status, helpers; INSERT defaults)

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

## Milestone 2 — Prepared (not yet applied)

**Date:** 2026-10-12
**Status:** Migration files created, awaiting Dashboard application
**Combined script:** `supabase/APPLY_M2_VIA_DASHBOARD.sql`

### New migrations:
4. `20261012000001_lifecycle.sql` — `post_transitions` audit table, `transition_post()` RPC (server-authorized state machine: open→booked→started→done→confirmed), `select_helpers()` RPC (owner-only, volunteer-verified)
5. `20261012000002_trigger_bypass.sql` — Transaction-local GUC bypass (`neighbloom.allow_system_field_update`, `neighbloom.allow_np_update`) so authorized SECURITY DEFINER functions can update locked fields. Raw API calls still blocked.
6. `20261012000003_messaging.sql` — `conversations` + `messages` tables with participant-only RLS. `create_conversation()` RPC (owner-only, helper must be selected, idempotent).
7. `20261012000004_np_awards.sql` — `np_ledger` audit table, `award_np()` RPC with idempotency keys. Exactly-once guarantee. Fixed amounts: +20 help_confirmed, +5 daily_checkin, +25 quick_start.

### Tests:
- `supabase/tests/m2_authz_tests.mjs` — 20 authorization tests covering lifecycle, messaging privacy, NP idempotency, and attack scenarios. Run after applying migrations: `node supabase/tests/m2_authz_tests.mjs`

### To apply:
1. Supabase Dashboard → SQL Editor
2. Paste entire `supabase/APPLY_M2_VIA_DASHBOARD.sql`
3. Run. Expected: "Success. No rows returned."
4. Run M2 authz tests to verify.

### Additional M2 migrations (2026-10-12):
8. `20261012000005_input_validation.sql` — Server-side CHECK constraints: length limits on posts (title 3-200, details 2000), replies (1-1000), profiles (display_name 1-50, town 100, handle format)
9. `20261012000006_moderation.sql` — `reports` table (6 reason types, dedup indexes, private RLS), `blocks` table, `is_blocked()` helper function

10. `20261012000007_rate_limits.sql` — Server-side rate limiting triggers: posts (10/hr, 30/day), replies (20/hr, 50/day), messages (60/hr, 200/day), reports (5/hr, 20/day). Cannot be bypassed by clearing localStorage.

11. `20261012000008_notifications_gratitude.sql` — Product Excellence (approved): notification_prefs (opt-in, granular, quiet hours), push_subscriptions (Web Push), notifications queue with server-side frequency caps (3/day, 10/week), queue_notification() RPC. gratitude_posts table (public thank-yous, helper can hide), post_gratitude() + hide_gratitude() RPCs, get_help_count() for "Helped X neighbors" display.
