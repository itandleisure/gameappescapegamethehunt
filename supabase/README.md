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

## Resultaten en fotoboek

- `session_results(sessie)`: ranglijst met punten, speeltijd, totaalafstand en foto's, voor spelleiding en spelers in de sessie.
- Foto's staan in de opslag-bucket `photos` onder `<team_id>/<opdracht>/<bestand>`; alleen het eigen team kan uploaden.
- Geheime link per sessie (`sessions.results_token`, aan met `results_shared`):
  - `GET /functions/v1/results-export?token=…` geeft JSON met foto-links (7 dagen geldig)
  - `GET /functions/v1/results-export?token=…&format=csv` geeft een CSV voor Excel of een fotoboek-tool
  - `rotate_results_token(sessie)` maakt een nieuwe link

Deployen van de functie: `npx supabase functions deploy results-export`.

## Fotoboek voor de klant

- `photobooks`: één fotoboek per sessie (stad, titel, tekst, taal, gekozen foto's in volgorde). Spelleiding en de maker van het spel (`can_watch_session`) beheren het.
- `photobook_settings`: per organisatie de omslagfoto, vaste algemene foto's en links (video, reviews, vacature, contact). Redacteur of hoger wijzigt ze.
- Bucket `photobooks`: eigen foto's en de PDF onder `<sessie>/…`, vaste foto's onder `huisstijl/<organisatie>/…`.
- Delen met link en wachtwoord (`share_token`, `share_password`), 28 dagen (`share_photobook(sessie, aan)` zet `shared_until`):
  - `POST /functions/v1/photobook` met `{ token, password }` geeft JSON met foto-links, omslag en PDF (1 dag geldig); 401 verkeerd wachtwoord, 410 verlopen
  - `shared_photobook(token, wachtwoord)` geeft alleen foto's van de eigen sessie en organisatie door
  - `rotate_photobook_token(sessie)` maakt een nieuwe link en een nieuw wachtwoord
