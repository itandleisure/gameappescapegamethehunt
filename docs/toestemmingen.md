# Toestemmingen van de speler-app

De app vraagt elke toestemming pas op het moment dat hij nodig is, nooit alles bij het opstarten. Vóór de vragen bij de
start toont de app een eigen kort uitlegscherm (`apps/player/src/ui/PermissionSteps.tsx`), zoals Apple en Google
willen. Alleen de eerste vraag (locatie) is nodig om te spelen; de andere kun je met "Niet nu" overslaan.

| Toestemming | Wanneer gevraagd | Waarvoor | Zonder toestemming |
|---|---|---|---|
| Locatie tijdens gebruik | Bij Start, na uitlegscherm 1 | Opdrachten openen op locatie | Spelen gaat niet; uitleg en knop naar Instellingen |
| Locatie altijd | Bij Start, na uitlegscherm 2 | GPS met het scherm uit / telefoon in de zak | GPS alleen met de app open |
| Meldingen | Bij Start, na uitlegscherm 3 | Trillen met het scherm uit als een opdracht opengaat of dichtbij is | Met het scherm uit trilt de telefoon niet (de opdracht opent wel) |
| Camera | Bij de eerste foto | Teamfoto en foto-opdrachten | Geen foto |
| Microfoon | Bij de eerste video | Geluid bij een video-opdracht | Video zonder geluid of geen video |
| Foto's bewaren (galerij) | Bij de eerste foto | Foto's en video's uit het spel ook op de eigen telefoon | Alleen naar de server; iPhone vraagt "foto's toevoegen", Android alleen tot en met Android 12 |

Trillen zelf vraagt geen toestemming. Met de app open trilt de telefoon kort als het team binnen 40 meter van een
opdracht op de kaart komt, en bij een opdracht die opengaat. Met het scherm uit gebeurt dat via een melding van de
telefoon zelf (lokale melding). Er is geen pushserver en de app vraagt geen pushtoestemming bij Apple.

De app leest de fotogalerij niet (geen `READ_MEDIA_IMAGES` of `READ_MEDIA_VIDEO` op Android, geen
`NSPhotoLibraryUsageDescription` op iPhone). Daarmee blijft de app buiten het strengere fotobeleid van Google Play.

## Teksten voor de beoordeling in de stores

**App Store (App Review, notities bij Background Modes: Location updates)**

> Escape Game The Hunt is an outdoor city game. Teams walk through the city with the phone in their pocket; tasks open
> automatically when the team reaches a location on the map. Background location is only used while a game is running
> (between Start and the end of the game) and stops when the game ends. A blue location indicator is shown while it is
> active. The app explains this on its own screen before iOS asks for "Always" access, and the game also works with
> "While Using" access (then the screen has to stay on).

**Google Play (Play Console, App content, Location permissions: background location)**

> Feature: tasks in an outdoor city game open automatically when the team arrives at a location, also while the phone is
> in a pocket with the screen off. Background location is used only during an active game and stops when the game
> ends. A persistent notification ("Escape Game The Hunt is tracking your location during the game") is shown while it
> runs. Video for the declaration: start a game, accept the location prompts, lock the screen and walk to a task; the
> phone vibrates and the task is open when the screen is turned on.

Google vraagt bij achtergrondlocatie ook een korte video (YouTube-link) van precies die stappen.

## Video-opdracht

Een optioneel opdrachttype (beheeromgeving, opdracht bewerken, Antwoord: "Video (korte film)"), standaard maximaal 30
seconden (in te stellen van 5 tot 60). Een spel dat het niet gebruikt, zoals The Hunt, vraagt dus ook nooit om de
microfoon. Video's gaan naar dezelfde opslag als de foto's (`photos`, maximaal 60 MB per bestand), staan op de
fotowall van de sessie en blijven buiten het fotoboek.
