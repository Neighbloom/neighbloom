#!/usr/bin/env bash
# ============================================================
# Neighbloom — dev database backup (Codespaces)
#
# Takes a full logical backup of the DEV project only, via the
# Session pooler (the verified path — the direct db.* host had
# IPv6 trouble from Codespaces), using the PostgreSQL 17 client.
#
#   * pg_dump custom format (compressed; restore = one pg_restore)
#   * Password via MASKED prompt; held only in PGPASSWORD, never
#     typed into a command, never written to a file, unset on exit.
#   * Output lands in $HOME/neighbloom-backups/ — OUTSIDE the repo,
#     so it can never be committed or pushed by accident.
#   * Verifies the result: pg_restore can read the archive, the
#     archive covers the expected schemas, and a SHA-256 checksum
#     is printed so the retained copy can be verified later.
#
# Scope note: a pg_dump is a LOGICAL backup (schema + data). It
# does not include Supabase project settings, Auth configuration,
# or storage objects.
#
# Usage:  bash scripts/backup-dev-db.sh [label]
#         label defaults to "backup" (e.g. pass pre-m3).
# ============================================================
set -euo pipefail

PROJECT_REF="nznrdeqwqrumkvdvzhnz"
POOLER_HOST="aws-0-us-east-2.pooler.supabase.com"
CONN="postgresql://postgres.${PROJECT_REF}@${POOLER_HOST}:5432/postgres?sslmode=require"
LABEL="${1:-backup}"
OUT_DIR="$HOME/neighbloom-backups"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/neighbloom-dev-${LABEL}-${STAMP}.dump"

echo "== PostgreSQL 17 client =="
PGDUMP="$(command -v pg_dump || true)"
if [ -n "$PGDUMP" ]; then
  PG_MAJOR="$($PGDUMP --version | grep -oE '[0-9]+' | head -1)"
else
  PG_MAJOR=0
fi
if [ "${PG_MAJOR:-0}" -lt 17 ]; then
  echo "pg_dump 17+ not found (detected major: ${PG_MAJOR:-none}). Installing from the PostgreSQL apt repo..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq wget gnupg >/dev/null
  wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /usr/share/keyrings/pgdg.gpg
  echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq postgresql-client-17 >/dev/null
  PGDUMP="$(command -v pg_dump)"
fi
echo "Using: $($PGDUMP --version)"
PGRESTORE="$(command -v pg_restore || true)"
[ -n "$PGRESTORE" ] || { echo "ABORT: pg_restore not found alongside pg_dump."; exit 1; }

echo
echo "== Database password (masked — nothing will appear as you paste/type) =="
read -rsp "Dev DB password: " PGPASSWORD; echo
export PGPASSWORD
trap 'unset PGPASSWORD' EXIT

echo
echo "== Backing up DEV project $PROJECT_REF via Session pooler =="
echo "Target file: $OUT_FILE"
$PGDUMP "$CONN" -Fc --no-owner --no-privileges -f "$OUT_FILE"
echo "Dump complete."

echo
echo "== Verifying backup =="
TOC_ENTRIES="$($PGRESTORE --list "$OUT_FILE" | grep -c ';')"
echo "Archive readable by pg_restore: $TOC_ENTRIES catalog entries."
[ "$TOC_ENTRIES" -gt 100 ] || { echo "FAIL: archive looks too small to be a full backup."; exit 1; }

# Sanity: the archive must contain the core app + M2 tables.
for marker in "TABLE public posts" "TABLE public profiles" "TABLE public notifications" "TABLE public np_ledger"; do
  if $PGRESTORE --list "$OUT_FILE" | grep -q "$marker"; then
    echo "OK: contains $marker"
  else
    echo "FAIL: archive is missing $marker"
    exit 1
  fi
done

SIZE_HUMAN="$(du -h "$OUT_FILE" | awk '{print $1}')"
SHA256="$(sha256sum "$OUT_FILE" | awk '{print $1}')"
echo
echo "=================================================="
echo "BACKUP VERIFIED"
echo "  File:   $OUT_FILE"
echo "  Size:   $SIZE_HUMAN"
echo "  SHA-256: $SHA256"
echo "=================================================="
echo "Retain a copy OUTSIDE this Codespace (it is ephemeral):"
echo "download the file from the file explorer (right-click ->"
echo "Download) to your phone or computer, and keep the SHA-256"
echo "above with it so the copy can be verified later."
unset PGPASSWORD
trap - EXIT
