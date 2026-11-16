# Database (Supabase)

- `migrations/` — schema, toegangsregels (row level security) en de inlogfuncties voor teams.
- `tests/` — tests voor de toegangsregels; draaien op een gewone Postgres met een kleine nabootsing van Supabase (`00_supabase_stub.sql`).

## Lokaal testen

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres pnpm test:db
```

De database moet leeg zijn. In CI draait dit automatisch tegen een Postgres-container.

## Hoe spelers inloggen

1. De app logt anoniem in bij Supabase (anonymous sign-in).
2. `join_session(code, teamnaam, taal)` maakt het team aan en verdeelt het over de tracks op volgorde van inloggen.
3. Op een tweede telefoon: `rejoin_team(teamcode)`.
4. `start_team(team)` zet de starttijd op servertijd.

Gebeurtenissen (`events`) krijgen hun id van de app, zodat de wachtrij veilig opnieuw kan versturen. `server_time` wordt altijd door de database gezet.

## Naar Supabase

Zodra het Supabase-project bestaat (regio Frankfurt):

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Zet daarna in Authentication → Providers "Anonymous sign-ins" aan.
