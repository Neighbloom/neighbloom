#!/usr/bin/env bash
# ============================================================
# Neighbloom M4 — one-command dev migration runner (Codespaces)
#
# Prerequisite: the GitHub Actions run ("M2 Migration Tests")
# must be GREEN for the commit containing this migration. Do not
# run this on a red or unknown CI verdict.
#
# What it does, in order:
#   1. Verifies the migration file is byte-identical to the
#      CI-green version (SHA-256 pinned below; aborts on mismatch).
#   2. Asks for the dev database password via a MASKED prompt.
#      Held only in PGPASSWORD; never typed into a command, never
#      written to a file, unset on exit.
#   3. READ-ONLY preflight. ABORTS if M3 is missing or if the M4
#      policy/grant already exists.
#   4. Stops and waits for you to type APPLY.
#   5. Applies the migration (single transaction).
#   6. Verifies the policy, the column-scoped grant (read_at
#      updatable, title still locked), and unchanged row counts.
#
# What M4 changes (found by live integration testing 2026-10-12:
# the app could display notifications but PATCH read_at returned
# 403 — migration 00008 granted SELECT only):
#   * GRANT UPDATE (read_at) ON notifications TO authenticated.
#   * Policy notifications_update_own: a user may UPDATE only
#     their own rows; the column grant limits that to read_at.
# Reversible: DROP the policy and REVOKE the grant.
#
# Connection: Session pooler (port 5432). Dev project ONLY.
# Usage:  bash scripts/apply-m4.sh
# ============================================================
set -euo pipefail

PROJECT_REF="nznrdeqwqrumkvdvzhnz"
POOLER_HOST="aws-0-us-east-2.pooler.supabase.com"
CONN="postgresql://postgres.${PROJECT_REF}@${POOLER_HOST}:5432/postgres?sslmode=require"
SQL_FILE="supabase/APPLY_M4_VIA_DASHBOARD.sql"
EXPECTED_SHA256="3731bf530cd08da52462ebe3bc993c8de9ddb41fb942a6e5902cb98754fb8e23"

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
echo "-- Prerequisite: M3 must be applied (timezone column + new-post trigger exist)..."
M3_OK="$($PSQL -Atc "SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_prefs' AND column_name='timezone') + (SELECT count(*) FROM pg_trigger WHERE tgname='trg_notify_new_post' AND NOT tgisinternal);")"
if [ "$M3_OK" != "2" ]; then
  echo "ABORT: M3 not fully present. Apply M3 first."
  exit 1
fi
echo "OK: M3 baseline present."

echo "-- Safeguard: M4 objects must not already exist..."
PREEXISTING="$($PSQL -Atc "SELECT (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_update_own') + (SELECT CASE WHEN has_column_privilege('authenticated','public.notifications','read_at','UPDATE') THEN 1 ELSE 0 END);")"
if [ "$PREEXISTING" != "0" ]; then
  echo "ABORT: M4 policy/grant already exists (score $PREEXISTING/2)."
  echo "M4 is fully or PARTIALLY applied. Refusing to run — review manually first."
  exit 1
fi
echo "OK: no M4 objects present. Clean pre-migration state confirmed."

COUNTS_SQL="SELECT (SELECT count(*) FROM auth.users) || '|' || (SELECT count(*) FROM public.profiles) || '|' || (SELECT count(*) FROM public.posts) || '|' || (SELECT count(*) FROM public.notifications);"
PRE_COUNTS="$($PSQL -Atc "$COUNTS_SQL")"
echo "-- Baseline row counts (auth.users | profiles | posts | notifications): $PRE_COUNTS"

echo
echo "== Step 4/5: Confirmation =="
echo "About to apply M4 to the DEV project $PROJECT_REF via the Session pooler."
echo "M4 is grant/policy-only (no data changes) and fully reversible."
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
POL_OK="$($PSQL -Atc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_update_own' AND cmd='UPDATE';")"
[ "$POL_OK" = "1" ] && echo "OK: notifications_update_own UPDATE policy exists." || { echo "FAIL: policy missing"; exit 1; }

GRANT_OK="$($PSQL -Atc "SELECT has_column_privilege('authenticated','public.notifications','read_at','UPDATE');")"
[ "$GRANT_OK" = "t" ] && echo "OK: authenticated can update read_at." || { echo "FAIL: read_at grant missing"; exit 1; }

TITLE_LOCKED="$($PSQL -Atc "SELECT has_column_privilege('authenticated','public.notifications','title','UPDATE');")"
[ "$TITLE_LOCKED" = "f" ] && echo "OK: title remains locked (least privilege holds)." || { echo "FAIL: title became updatable — grant is broader than intended"; exit 1; }

POST_COUNTS="$($PSQL -Atc "$COUNTS_SQL")"
echo "-- Post-migration row counts: $POST_COUNTS"
if [ "$POST_COUNTS" = "$PRE_COUNTS" ]; then
  echo "OK: row counts unchanged."
else
  echo "FAIL: row counts changed! Pre: $PRE_COUNTS  Post: $POST_COUNTS"
  exit 1
fi

unset PGPASSWORD
trap - EXIT
echo
echo "=================================================="
echo "M4 APPLIED — own-row mark-as-read enabled,"
echo "content columns still locked, data untouched."
echo "=================================================="
