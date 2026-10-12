#!/usr/bin/env bash
# ============================================================
# Neighbloom M3 — one-command dev migration runner (Codespaces)
#
# Prerequisite: the M3 GitHub Actions run ("M2 Migration Tests")
# must be GREEN for the commit containing this migration. Do not
# run this on a red or unknown CI verdict.
#
# What it does, in order:
#   1. Verifies the migration file is byte-identical to the CI-green
#      version (SHA-256 pinned below; aborts on any mismatch).
#   2. Asks for the dev database password via a MASKED prompt.
#      The password is held only in the PGPASSWORD env var, is never
#      typed into a command, never written to a file, and is unset
#      on exit.
#   3. Runs READ-ONLY preflight checks. ABORTS if M2 is missing or
#      if ANY M3 object already exists (guards against a preexisting
#      or partially applied M3).
#   4. Stops and waits for you to type APPLY before changing anything.
#   5. Applies the migration (single transaction — all or nothing).
#   6. Verifies structure (columns, triggers, functions, exactly one
#      queue_notification overload) and row counts. Prints PASS/FAIL.
#
# What M3 changes (all additive / function replacement):
#   * notification_prefs gains timezone + notify_gratitude columns.
#   * queue_notification is replaced by ONE canonical version
#     (the two divergent legacy overloads from migrations 00008 and
#     00011 are dropped — that collision is what failed CI run #11).
#   * Five AFTER INSERT triggers wire volunteer / message / NP-award /
#     gratitude / new-post events into the notification queue.
#   * No existing rows are modified; row counts must be unchanged.
#
# Connection: Session pooler (port 5432) — the direct db.* host had
# IPv6 trouble from Codespaces; the pooler is the verified path.
# Target: dev project ONLY (ref hardcoded below).
# Usage:  bash scripts/apply-m3.sh
# ============================================================
set -euo pipefail

PROJECT_REF="nznrdeqwqrumkvdvzhnz"
POOLER_HOST="aws-0-us-east-2.pooler.supabase.com"
CONN="postgresql://postgres.${PROJECT_REF}@${POOLER_HOST}:5432/postgres?sslmode=require"
SQL_FILE="supabase/APPLY_M3_VIA_DASHBOARD.sql"
EXPECTED_SHA256="b793794a67b484e75728ce5ce1b2ea5aa32d0975b9438e9ee9c1e0e1274b8426"

M3_TRIGGERS="'trg_notify_volunteer','trg_notify_message','trg_notify_np_award','trg_notify_gratitude','trg_notify_new_post'"
M3_FUNCTIONS="'notify_on_volunteer','notify_on_message','notify_on_np_award','notify_on_gratitude','notify_on_new_post'"

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
echo "-- Prerequisite: M2 must be applied (notification tables exist)..."
M2_OK="$($PSQL -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('notification_prefs','notifications');")"
if [ "$M2_OK" != "2" ]; then
  echo "ABORT: M2 notification tables not found. Apply M2 first."
  exit 1
fi
echo "OK: M2 baseline present."

echo "-- Safeguard: checking for ANY preexisting M3 objects..."
PREEXISTING="$($PSQL -Atc "
  SELECT COALESCE(string_agg(obj, ', '), '') FROM (
    SELECT 'column:notification_prefs.' || column_name AS obj FROM information_schema.columns
      WHERE table_schema='public' AND table_name='notification_prefs'
        AND column_name IN ('timezone','notify_gratitude')
    UNION ALL
    SELECT 'trigger:' || t.tgname FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal
        AND t.tgname IN ($M3_TRIGGERS)
    UNION ALL
    SELECT 'function:' || p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ($M3_FUNCTIONS)
    UNION ALL
    SELECT 'queue_notification:new-version' FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='queue_notification'
        AND p.prosrc LIKE '%notify_gratitude%'
  ) s;")"
if [ -n "$PREEXISTING" ]; then
  echo "ABORT: M3 objects already exist: $PREEXISTING"
  echo "M3 is fully or PARTIALLY applied. Refusing to run — a partial"
  echo "state must be reviewed manually before any migration attempt."
  exit 1
fi
echo "OK: no M3 objects present. Clean pre-migration state confirmed."

COUNTS_SQL="SELECT (SELECT count(*) FROM auth.users) || '|' || (SELECT count(*) FROM public.profiles) || '|' || (SELECT count(*) FROM public.posts) || '|' || (SELECT count(*) FROM public.replies) || '|' || (SELECT COALESCE(sum(np),0) FROM public.profiles) || '|' || (SELECT count(*) FROM public.notifications);"
PRE_COUNTS="$($PSQL -Atc "$COUNTS_SQL")"
echo "-- Baseline row counts (auth.users | profiles | posts | replies | total NP | notifications): $PRE_COUNTS"
echo "   (Row counts only — a full content-level integrity audit is a separate step.)"

echo
echo "== Step 4/5: Confirmation =="
echo "About to apply M3 to the DEV project $PROJECT_REF via the Session pooler."
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
COLS_OK="$($PSQL -Atc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_prefs' AND column_name IN ('timezone','notify_gratitude');")"
[ "$COLS_OK" = "2" ] && echo "OK: notification_prefs gained timezone + notify_gratitude." || { echo "FAIL: expected 2 new prefs columns, found $COLS_OK"; exit 1; }

TRG_COUNT="$($PSQL -Atc "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname IN ($M3_TRIGGERS);")"
[ "$TRG_COUNT" = "5" ] && echo "OK: all 5 notification triggers exist." || { echo "FAIL: expected 5 triggers, found $TRG_COUNT"; exit 1; }

FN_COUNT="$($PSQL -Atc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ($M3_FUNCTIONS);")"
[ "$FN_COUNT" = "5" ] && echo "OK: all 5 trigger functions exist." || { echo "FAIL: expected 5 trigger functions, found $FN_COUNT"; exit 1; }

OVERLOADS="$($PSQL -Atc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='queue_notification';")"
[ "$OVERLOADS" = "1" ] && echo "OK: exactly one queue_notification overload (the CI run #11 collision is gone)." || { echo "FAIL: expected 1 queue_notification overload, found $OVERLOADS"; exit 1; }

GRAT_FIXED="$($PSQL -Atc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='post_gratitude' AND p.prosrc LIKE '%M3 change vs 00008%';")"
[ "$GRAT_FIXED" = "1" ] && echo "OK: post_gratitude replaced — its queue call now passes the actor (block check applies)." || { echo "FAIL: post_gratitude replacement not detected"; exit 1; }

echo "-- Existing data: row-count comparison (counts only, NOT content integrity)"
POST_COUNTS="$($PSQL -Atc "$COUNTS_SQL")"
echo "   Post-migration (auth.users | profiles | posts | replies | total NP | notifications): $POST_COUNTS"
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
echo "M3 APPLIED — columns, triggers, single canonical"
echo "queue function, and row counts verified."
echo "Integration tests against dev are the next step."
echo "=================================================="
