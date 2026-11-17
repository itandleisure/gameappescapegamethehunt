# Speler-app (fase 2)

React Native + Expo (TypeScript) voor iPhone en Android. Wordt in fase 2 opgezet.

Gebruikt uit `@hunt/engine`:

- `computeState` om het spel offline te laten lopen
- `LocationGate` en `reachableTargets` voor GPS-activatie met filtering
- `estimateClockOffset` / `toServerTime` om op servertijd te rekenen
- `t` en `interpolate` voor teksten in de gekozen taal

## Expo-project

| Instelling | Waarde |
|---|---|
| Owner (organisatie) | `the-badass-group` |
| Slug | `gameappescapegamethehunt` |
| Project ID (`extra.eas.projectId` in app.json) | `af20ef2e-91ed-4ff2-88fb-19a7f95b444e` |

De naam in de stores en op het telefoonscherm stellen we apart in (`name` in app.json). Het toegangstoken voor automatische builds (`EXPO_TOKEN`) komt als secret in GitHub, nooit in de repository.
