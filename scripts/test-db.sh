#!/usr/bin/env bash
# Test de databasemigraties en toegangsregels op een gewone Postgres.
#
# Gebruik:
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bash scripts/test-db.sh
#
# De database moet leeg zijn (bijvoorbeeld een wegwerp-container of de
# Postgres-service in CI). Op Supabase zelf zijn de migraties met
# `supabase db push` toe te passen; de stub is daar niet nodig.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?Zet DATABASE_URL naar een lege Postgres-database}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X -o /dev/null)

echo "→ Supabase-stub"
"${PSQL[@]}" -f supabase/tests/00_supabase_stub.sql

for f in supabase/migrations/*.sql; do
  echo "→ migratie $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

for f in supabase/tests/[1-9]*.sql; do
  echo "→ test $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
