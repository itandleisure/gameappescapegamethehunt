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

# Twee migraties met hetzelfde versienummer blokkeren "supabase db push" op
# het live project (dan gaat geen enkele volgende migratie meer live).
dupes=$(ls supabase/migrations/*.sql | xargs -n1 basename | cut -d_ -f1 | sort | uniq -d)
if [ -n "$dupes" ]; then
  echo "✗ Dubbel migratienummer: $dupes. Geef elke migratie een eigen tijdstempel." >&2
  exit 1
fi

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
