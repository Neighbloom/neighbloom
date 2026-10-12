#!/usr/bin/env bash
# ============================================================
# Neighbloom M2 — one-command dev migration runner (Codespaces)
#
# What it does, in order:
#   1. Verifies the migration file is byte-identical to the CI-green version
#      (SHA-256 pinned below; aborts on any mismatch).
#   2. Asks for the dev database password via a MASKED prompt.
#      The password is held only in the PGPASSWORD env var, is never
#      typed into a command, never written to a file, and is unset on exit.
#   3. Runs READ-ONLY preflight checks. ABORTS if any M2 object already
#      exists (guards against a preexisting or partially applied M2).
#   4. Stops and waits for you to type APPLY before changing anything.
#   5. Applies the migration (single transaction — all or nothing).
#   6. Verifies structure, RLS enablement, and row counts. Prints PASS/FAIL.
#
# Verification scope — stated plainly:
#   * Row counts prove no rows were added/removed by the migration.
#     They are NOT a full content-level data-integrity audit.
#   * The RLS check proves row-level security is ENABLED on the new
#     tables. Policy-by-policy behavior is proven by the CI test suite
#     and the post-migration integration tests, not by this script.
#
# Connection: Session pooler (port 5432) — the direct db.* host had IPv6
# trouble from Codespaces; the pooler is the path verified during backup.
# Target: dev project ONLY (ref hardcoded below).
# Usage:  bash scripts/apply-m2.sh
# ============================================================
set -euo pipefail

PROJECT_REF="nznrdeqwqrumkvdvzhnz"
POOLER_HOST="aws-0-us-east-2.pooler.supabase.com"
CONN="postgresql://postgres.${PROJECT_REF}@${POOLER_HOST}:5432/postgres?sslmode=require"
SQL_FILE="supabase/APPLY_M2_VIA_DASHBOARD.sql"
EXPECTED_SHA256="0546cab7e40cc99521a243abdac5d1aeb93a4352b7b5cd863f3b5ace649525ef"

M2_TABLES="blocks conversations gratitude_posts messages notification_prefs notifications np_ledger post_transitions push_subscriptions reports"
M2_FUNCTIONS="'award_np','transition_post','select_helpers','is_blocked','get_help_count','get_neighbor_directory'"

cd "$(dirname "$0")/.."

echo "== Step 1/5: Verify migration file matches the CI-green version =="
ACTUAL_SHA256="$(sha256sum "$SQL_FILE" | awk '{print $1}')"
if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "ABORT: $SQL_FILE hash mismatch."
  echo "  expected: $EXPECTED_SHA256"
  echo "  actual:   $ACTUAL_SHA256"
  exit 1
fi
echo "OK: SHA-256 matches the version that passed GitHub Actions."

command -v psql >/dev/null || { echo "Installing PostgreSQL client..."; sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client >/dev/null; }

echo
echo "== Step 2/5: Database password (masked — nothing will appear as you paste/type) =="
read -rsp "Dev DB password: " PGPASSWORD; echo
export PGPASSWORD
trap 'unset PGPASSWORD' EXIT

PSQL="psql $CONN -X -v ON_ERROR_STOP=1"

echo
echo "== Step 3/5: Read-only preflight (no changes are made) =="
echo "-- Existing public tables:"
$PSQL -Atc "SELECT string_agg(table_name, ', ' ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"

echo "-- Safeguard: checking for ANY preexisting M2 objects..."
PREEXISTING="$($PSQL -Atc "
  SELECT COALESCE(string_agg(obj, ', '), '') FROM (
    SELECT 'table:' || table_name AS obj FROM information_schema.tables
      WHERE table_schema='public' AND table_name = ANY (string_to_array('$M2_TABLES',' '))
    UNION ALL
    SELECT 'view:visible_profiles' FROM information_schema.views
      WHERE table_schema='public' AND table_name='visible_profiles'
    UNION ALL
    SELECT 'function:' || p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ($M2_FUNCTIONS)
    UNION ALL
    SELECT 'column:profiles.intro_visible' FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name='intro_visible'
  ) s;")"
if [ -n "$PREEXISTING" ]; then
  echo "ABORT: M2 objects already exist: $PREEXISTING"
  echo "M2 is fully or PARTIALLY applied. Refusing to run — a partial"
  echo "state must be reviewed manually before any migration attempt."
  exit 1
fi
echo "OK: no M2 objects present. Clean pre-migration state confirmed."

COUNTS_SQL="SELECT (SELECT count(*) FROM auth.users) || '|' || (SELECT count(*) FROM public.profiles) || '|' || (SELECT count(*) FROM public.posts) || '|' || (SELECT count(*) FROM public.replies) || '|' || (SELECT COALESCE(sum(np),0) FROM public.profiles);"
PRE_COUNTS="$($PSQL -Atc "$COUNTS_SQL")"
echo "-- Baseline row counts (auth.users | profiles | posts | replies | total NP): $PRE_COUNTS"
echo "   (Row counts only — a full content-level integrity audit is a separate step.)"

echo
echo "== Step 4/5: Confirmation =="
echo "About to apply M2 to the DEV project $PROJECT_REF via the Session pooler."
echo "A verified pg_dump backup exists on the founder's device."
read -rp "Type APPLY to continue, anything else to abort: " CONFIRM
if [ "$CONFIRM" != "APPLY" ]; then
  echo "Aborted. No changes were made."
  exit 0
fi

echo
echo "== Step 5/5: Applying migration (single transaction) =="
$PSQL -q -f "$SQL_FILE"
echo "Migration applied."

echo
echo "== Verification =="
echo "-- Structure: M2 tables"
MISSING=""
for t in $M2_TABLES; do
  EXISTS="$($PSQL -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$t';")"
  [ "$EXISTS" = "1" ] || MISSING="$MISSING $t"
done
if [ -n "$MISSING" ]; then
  echo "FAIL: missing M2 tables:$MISSING"
  exit 1
fi
echo "OK: all 10 M2 tables exist."

VIEW_OK="$($PSQL -Atc "SELECT count(*) FROM information_schema.views WHERE table_schema='public' AND table_name='visible_profiles';")"
[ "$VIEW_OK" = "1" ] && echo "OK: visible_profiles view exists." || { echo "FAIL: visible_profiles view missing"; exit 1; }

echo "-- Structure: M2 functions"
FN_COUNT="$($PSQL -Atc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ($M2_FUNCTIONS);")"
[ "$FN_COUNT" = "6" ] && echo "OK: all 6 key M2 functions exist." || { echo "FAIL: expected 6 key functions, found $FN_COUNT"; exit 1; }

echo "-- Permissions smoke check: RLS enabled on new tables"
echo "   (Enablement only — policy behavior is proven by CI + integration tests.)"
RLS_OFF="$($PSQL -Atc "SELECT COALESCE(string_agg(c.relname, ', '), '') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname = ANY (string_to_array('$M2_TABLES',' ')) AND NOT c.relrowsecurity;")"
if [ -n "$RLS_OFF" ]; then
  echo "FAIL: RLS is NOT enabled on: $RLS_OFF"
  exit 1
fi
echo "OK: RLS enabled on all 10 M2 tables."

echo "-- Existing data: row-count comparison (counts only, NOT content integrity)"
POST_COUNTS="$($PSQL -Atc "$COUNTS_SQL")"
echo "   Post-migration (auth.users | profiles | posts | replies | total NP): $POST_COUNTS"
if [ "$POST_COUNTS" = "$PRE_COUNTS" ]; then
  echo "OK: row counts unchanged."
else
  echo "FAIL: row counts changed! Pre: $PRE_COUNTS  Post: $POST_COUNTS"
  echo "Do NOT proceed — contact Felix and consider restoring the backup."
  exit 1
fi

unset PGPASSWORD
trap - EXIT
echo
echo "=================================================="
echo "M2 APPLIED — structure, RLS enablement, and row"
echo "counts verified. Policy behavior + full app"
echo "integration tests are the next step."
echo "=================================================="
