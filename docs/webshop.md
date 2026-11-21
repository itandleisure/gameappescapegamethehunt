# Webshop maakt tickets aan

Koopt een klant in de webshop bijvoorbeeld *The Hunt Leeuwarden voor 20 personen (4 teams)*, dan stuurt de webshop
één bericht naar de beheeromgeving. Er komt meteen een **open ticket** waarmee **maximaal 4 teams** kunnen inloggen.
De webshop krijgt de spelcode en de spellink terug en zet die in de bevestigingsmail. Het 5e team krijgt in de app de
melding dat het ticket vol is. Spelleiders tellen niet mee (die hebben hun eigen maximum, standaard 20).

## Instellen

1. Beheeromgeving → **Instellingen › Webshop** → **Sleutel maken** (alleen eigenaar of beheerder). Kopieer de sleutel
   meteen: hij is daarna niet meer te zien. Een nieuwe sleutel maakt de oude ongeldig.
2. Zet de sleutel en het adres in de webshop. Op dezelfde pagina staan het adres, een voorbeeld en de game-ID's.
3. Supabase: de functie uitrollen met `npx supabase functions deploy webshop-ticket`. Optioneel het spel-domein voor de
   link: `npx supabase secrets set SPEL_DOMEIN=https://escapegamethehunt.badassgames.nl` (dat is ook de standaard).

## Het bericht

```http
POST https://<project>.supabase.co/functions/v1/webshop-ticket
Authorization: Bearer <webshopsleutel>
Content-Type: application/json

{
  "game": "the-hunt-leeuwarden",
  "teams": 4,
  "order": "WS-1001",
  "name": "Jansen, 20 personen",
  "starts_at": "2026-12-05T14:00:00+01:00"
}
```

| Veld | Verplicht | Uitleg |
| --- | --- | --- |
| `game` | ja | Game-ID van de stad of het klantspel (zie Instellingen › Webshop). |
| `teams` | ja | Aantal gekochte teams (spelcodes), 1 tot 500. Zoveel teams mogen inloggen. |
| `order` | ja | Bestelnummer. Dezelfde bestelling nog eens geeft hetzelfde ticket, dus opnieuw proberen is veilig. |
| `name` | nee | Naam van het ticket in de beheeromgeving. Leeg: "Webshop <bestelnummer>". |
| `starts_at` | nee | Startmoment (ISO 8601). |

De sleutel mag ook in de header `X-Webshop-Key` staan.

## Het antwoord

`201 Created` (nieuw ticket) of `200 OK` (deze bestelling had al een ticket, `"existing": true`):

```json
{
  "ticket_id": "…",
  "name": "Jansen, 20 personen",
  "code": "K7QX2",
  "link": "https://escapegamethehunt.badassgames.nl/the-hunt-leeuwarden:K7QX2",
  "game_id": "the-hunt-leeuwarden",
  "max_teams": 4,
  "status": "open",
  "starts_at": "2026-12-05T13:00:00+00:00",
  "order": "WS-1001",
  "existing": false
}
```

Fouten komen terug als `{ "error": "…" }` met `400` (bericht klopt niet), `401` (sleutel ontbreekt of is ongeldig),
`404` (onbekend of nog niet gepubliceerd spel) of `500`.

Het ticket krijgt de nieuwste gepubliceerde versie van het spel en de standaard uit Instellingen › Nieuwe tickets
(tijdzone, tracks, teamchat). Het maximum aantal teams is daarna in de beheeromgeving op de ticketpagina aan te passen.
