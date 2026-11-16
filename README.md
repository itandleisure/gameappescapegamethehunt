# The Hunt app

Eigen spelplatform voor The Hunt en andere GPS-buitenspellen, ter vervanging van Loquiz.

Onderdelen (gepland):

- **Speler-app** voor iPhone en Android (één codebase)
- **Beheeromgeving** (web) om games, steden, klantvarianten en vertalingen te beheren en spellen live te volgen
- **Server** voor accounts, data, live-updates en resultaten

Zie [docs/ontwerp.md](docs/ontwerp.md) voor het technisch ontwerp en de planning.

## Opbouw van de repository

| Map | Inhoud | Status |
|---|---|---|
| `packages/engine` | Spelregel-engine en gedeelde datatypes | fase 1 |
| `supabase` | Database, toegangsregels en inlogfuncties voor teams | fase 1 |
| `apps/player` | Speler-app (React Native + Expo) | fase 2 |
| `apps/admin` | Beheeromgeving (Next.js) | fase 3 |

## Ontwikkelen

Vereist Node 22 en pnpm (`corepack enable`).

```bash
pnpm install
pnpm test        # engine-tests, waaronder het Leeuwarden-scenario
pnpm typecheck
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres pnpm test:db
```
