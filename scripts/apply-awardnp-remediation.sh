#!/usr/bin/env bash
# ============================================================
# Neighbloom — award_np remediation runner (Codespaces, DEV ONLY)
#
# Founder-approved 2026-10-14. Applies
# supabase/migrations/20261014000001_award_np_remediation.sql
# with the program's standard safeguards, in order:
#   1. Verifies the migration file is byte-identical to the
#      approved version (SHA-256 pinned below; aborts otherwise).
#   2. Asks for the dev database password via a MASKED prompt
#      (held only in PGPASSWORD, never written anywhere).
#   3. Takes a full pg_dump backup FIRST, to
#      $HOME/neighbloom-backups/ (outside the repo), verifies it
#      parses, and prints its SHA-256.
#   4. Runs the read-only duplicate preflight gate. ABORTS
#      unless the ONLY duplicate help_confirmed group is the
#      one known probe pair.
#   5. Waits for an explicit APPLY confirmation.
#   6. Applies the migration in a single transaction.
#   7. Runs the post-checks and prints PASS/FAIL for each.
#
# Connection: Session pooler (the verified path). Target: the
# DEV project only (ref hardcoded below).
# Usage:  bash scripts/apply-awardnp-remediation.sh
# ============================================================
set -euo pipefail

PROJECT_REF="nznrdeqwqrumkvdvzhnz"
POOLER_HOST="aws-0-us-east-2.pooler.supabase.com"
CONN="postgresql://postgres.${PROJECT_REF}@${POOLER_HOST}:5432/postgres?sslmode=require"
MIGRATION="supabase/migrations/20261014000001_award_np_remediation.sql"
MIGRATION_SHA256="ad2c248a0a2ace94260386fee975f5a419abeb51726441ec6ca7245b3d0251b2"
BACKUP_DIR="$HOME/neighbloom-backups"
BACKUP_FILE="$BACKUP_DIR/neighbloom-dev-pre-awardnp-20261014.dump"

fail() { echo "ABORT: $1" >&2; exit 1; }

echo "== Step 1: verify migration file integrity =="
[ -f "$MIGRATION" ] || fail "migration file not found: $MIGRATION"
ACTUAL_SHA="$(sha256sum "$MIGRATION" | awk '{print $1}')"
[ "$ACTUAL_SHA" = "$MIGRATION_SHA256" ] || fail "migration SHA-256 mismatch (got $ACTUAL_SHA)"
echo "PASS: migration file matches the approved SHA-256."

echo "== Step 2: dev database password (masked) =="
read -rsp "Dev DB password: " PGPASSWORD; echo
export PGPASSWORD
trap 'unset PGPASSWORD' EXIT

echo "== Step 3: backup BEFORE any change =="
mkdir -p "$BACKUP_DIR"
pg_dump "$CONN" -Fc -f "$BACKUP_FILE" || fail "pg_dump failed"
pg_restore --list "$BACKUP_FILE" >/dev/null || fail "backup does not parse"
BACKUP_SIZE="$(stat -c%s "$BACKUP_FILE")"
BACKUP_SHA="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
echo "PASS: backup written: $BACKUP_FILE"
echo "      bytes: $BACKUP_SIZE"
echo "      sha256: $BACKUP_SHA"

echo "== Step 4: preflight duplicate gate (read-only) =="
GATE="$(psql "$CONN" -tA -F'|' -c "SELECT post_id, profile_id, COUNT(*) FROM public.np_ledger WHERE reason = 'help_confirmed' AND post_id IS NOT NULL GROUP BY post_id, profile_id HAVING COUNT(*) > 1;")"
echo "Gate output:"
echo "$GATE"
EXPECTED_GATE="fbff5c5e-2d8c-46dc-ae97-23ff89022f46|c3c9c550-8376-40cb-bcc9-f5b4363fb447|2"
[ "$GATE" = "$EXPECTED_GATE" ] || fail "preflight gate mismatch — expected exactly the one known probe pair; nothing applied"
echo "PASS: exactly the one known duplicate pair."

echo "== Step 5: confirmation =="
read -rp "Type APPLY to execute the migration on the DEV database: " CONFIRM
[ "$CONFIRM" = "APPLY" ] || fail "not confirmed"

echo "== Step 6: apply (single transaction, stop on error) =="
psql "$CONN" -v ON_ERROR_STOP=1 -f "$MIGRATION"
echo "PASS: migration applied (COMMIT)."

echo "== Step 7: post-checks =="
SAM_NP="$(psql "$CONN" -tA -c "SELECT np FROM public.profiles WHERE id = 'c3c9c550-8376-40cb-bcc9-f5b4363fb447';")"
[ "$SAM_NP" = "40" ] && echo "PASS (a): Sam np = 40" || echo "FAIL (a): Sam np = $SAM_NP (expected 40)"

echo "(b) Ledger rows for the bookshelf post:"
psql "$CONN" -c "SELECT amount, reason, award_state, idempotency_key FROM public.np_ledger WHERE post_id = 'fbff5c5e-2d8c-46dc-ae97-23ff89022f46' ORDER BY created_at;"
ROWCOUNT="$(psql "$CONN" -tA -c "SELECT COUNT(*) FROM public.np_ledger WHERE post_id = 'fbff5c5e-2d8c-46dc-ae97-23ff89022f46';")"
REVSTATE="$(psql "$CONN" -tA -c "SELECT award_state FROM public.np_ledger WHERE id = 'd35feb1d-e890-4363-bc47-0ffcdbcf2974';")"
{ [ "$ROWCOUNT" = "3" ] && [ "$REVSTATE" = "reversed" ]; } && echo "PASS (b): 3 rows, probe award reversed" || echo "FAIL (b): rows=$ROWCOUNT probe_state=$REVSTATE"

IDX="$(psql "$CONN" -tA -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'np_ledger_help_once';")"
[ "$IDX" = "1" ] && echo "PASS (c): unique index np_ledger_help_once exists" || echo "FAIL (c): index count = $IDX"

FNC="$(psql "$CONN" -tA -c "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='award_np' AND pg_get_functiondef(p.oid) LIKE '%no longer available%';")"
[ "$FNC" = "1" ] && echo "PASS (d): award_np is the remediated version" || echo "FAIL (d): function check = $FNC"

echo "== DONE =="
