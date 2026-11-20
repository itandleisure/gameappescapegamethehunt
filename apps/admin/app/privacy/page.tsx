import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Privacyverklaring van de speler-app (openbaar, geen inlog nodig). De App
 * Store, Google Play en het aanmeldscherm van de app linken naar /privacy.
 *
 * Bedrijfsgegevens: vul ze hieronder in. Zolang er een [ ... ] staat, is de
 * verklaring nog niet compleet.
 */
const COMPANY = {
  name: '[OFFICIËLE BEDRIJFSNAAM]',
  tradeName: 'Badass Games / Escape Game The Hunt',
  address: '[STRAAT, POSTCODE, PLAATS]',
  kvk: '[KVK-NUMMER]',
  email: '[PRIVACY-E-MAILADRES]',
  website: 'https://badassgames.nl',
};
const VERSION = 'Versie 1.0, geldig vanaf [DATUM]';

export const metadata: Metadata = { title: 'Privacyverklaring – Escape Game The Hunt' };

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="privacy-table">
      <table>
        {head.length ? (
          <thead>
            <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const mail = <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>;

export default function PrivacyPage() {
  return (
    <article className="privacy">
      <h1>Privacyverklaring app Escape Game The Hunt</h1>
      <p className="muted">{VERSION}</p>
      <p>
        In deze verklaring lees je welke gegevens de app Escape Game The Hunt verwerkt, waarom, hoe lang we ze bewaren en
        welke rechten je hebt. Kort gezegd: we gebruiken alleen wat nodig is om het spel te spelen, en 28 dagen na de hunt
        verwijderen we je persoonsgegevens.
      </p>

      <h2>1. Wie wij zijn</h2>
      <p>
        Escape Game The Hunt is een buitenspel van Badass Games. Teams lopen met de app door een stad; opdrachten openen
        vanzelf als het team op de juiste plek is. Verantwoordelijk voor de verwerking volgens de AVG:
      </p>
      <Table
        head={[]}
        rows={[
          ['Bedrijfsnaam', COMPANY.name],
          ['Handelsnaam', COMPANY.tradeName],
          ['Adres', COMPANY.address],
          ['KvK-nummer', COMPANY.kvk],
          ['E-mail voor privacyvragen', mail],
          ['Website', <a href={COMPANY.website}>badassgames.nl</a>],
        ]}
      />
      <p>
        Deze verklaring geldt voor de speler-app voor iPhone en Android, de webversie van de app, de spelleider-modus in de
        app en de links naar resultaten en het fotoboek.
      </p>

      <h2>2. Welke gegevens we verwerken en waarom</h2>
      <p>
        Je hoeft geen account aan te maken en we vragen niet om je naam, e-mailadres of geboortedatum. De app maakt bij het
        openen een willekeurige, anonieme gebruikers-id aan waarmee je telefoon aan je team gekoppeld wordt.
      </p>
      <Table
        head={['Gegevens', 'Waarvoor', 'Wie ziet het']}
        rows={[
          ['Teamnaam, taal en spelcode', 'Je team herkennen, de ranglijst en de juiste taal', 'Je team, de andere teams in dezelfde hunt (ranglijst) en de spelleiding'],
          ['Teamcode', 'Met een tweede telefoon of later verder spelen', 'Je team en de spelleiding'],
          ['Telefoonnummer van het team', 'De spelleiding kan het team bellen tijdens het spel, bijvoorbeeld bij problemen of voor je veiligheid', 'Alleen je team en de spelleiding; andere teams nooit'],
          ['Locatie (GPS), ook op de achtergrond, alleen tijdens een lopend spel', 'Opdrachten openen als je ter plekke bent; de spelleiding ziet waar teams lopen; de afgelegde afstand berekenen', 'Je team en de spelleiding'],
          ["Foto's en video's uit het spel (ook de teamfoto), met geluid bij video", "Opdrachten beoordelen, de fotowall, de resultaten en het fotoboek", 'Je team, de spelleiding, de andere deelnemers aan dezelfde hunt en de klant die de hunt boekte (fotoboek)'],
          ["Chatberichten en foto's in de chat", 'Contact tussen teams en spelleiding tijdens de hunt', 'De deelnemers en de spelleiding van dezelfde hunt'],
          ['Antwoorden, punten, hints en tijden', 'Het spel spelen, de stand en de ranglijst', 'Je team, de andere teams (stand) en de spelleiding'],
          ['Technische meldingen en toestelgegevens (systeem, model of browser, appversie, installatie-id)', 'Problemen vinden en oplossen, zoals zwakke GPS, mislukte uploads of crashes', 'De organisatie van de hunt en onze technische beheerders'],
          ['IP-adres en verbindingsgegevens', 'De app laten werken en beveiligen', 'Onze hostingpartijen (zie hoofdstuk 4)'],
        ]}
      />

      <h3>Toestemmingen op je telefoon</h3>
      <p>
        De app vraagt elke toestemming pas als die nodig is, met eerst een eigen uitlegscherm. Je kunt toestemmingen altijd
        intrekken in de instellingen van je telefoon.
      </p>
      <Table
        head={['Toestemming', 'Waarvoor', 'Zonder toestemming']}
        rows={[
          ['Locatie tijdens gebruik', 'Opdrachten openen op locatie', 'Spelen is dan niet mogelijk'],
          ['Locatie altijd (achtergrond)', 'GPS blijft werken met het scherm uit, alleen tijdens een lopend spel', 'GPS werkt alleen met de app open'],
          ['Meldingen', 'Trillen en een melding met het scherm uit als een opdracht opengaat', 'Geen melding met het scherm uit'],
          ['Camera', "Teamfoto en foto- en video-opdrachten", "Geen foto's of video's"],
          ['Microfoon', 'Alleen geluid bij een video-opdracht', 'Video zonder geluid of geen video'],
          ["Foto's bewaren in je galerij", "Een kopie van je spelfoto's en -video's op je telefoon", "Foto's gaan alleen naar het spel"],
        ]}
      />
      <ul>
        <li>De app leest je fotogalerij, contacten of agenda niet.</li>
        <li>
          De app volgt je locatie niet buiten een spel. Op Android zie je een vaste melding zolang de locatie op de
          achtergrond loopt; op iPhone de blauwe locatie-aanduiding.
        </li>
        <li>De app stuurt geen pushberichten via een server; meldingen komen van je telefoon zelf.</li>
        <li>Geen advertenties, geen analyse- of trackingdiensten, en we verkopen geen gegevens.</li>
        <li>We gebruiken je gegevens niet voor geautomatiseerde besluitvorming of profilering.</li>
      </ul>
      <p>
        Op je telefoon (of in je browser bij de webversie) bewaart de app je teamcode, de spelgegevens, antwoorden en
        foto&apos;s die nog verstuurd moeten worden, en de kaart van het speelveld zodat je ook zonder bereik kunt spelen.
        Dit is nodig voor de werking; er zijn geen trackingcookies. De kaart wordt na afloop verwijderd.
      </p>

      <h2>3. Grondslagen, bewaartermijnen en delen</h2>
      <Table
        head={['Verwerking', 'Grondslag (artikel 6 AVG)']}
        rows={[
          ["Spel spelen: teamnaam, teamcode, antwoorden, punten, locatie, foto's, video's en chat", 'Uitvoering van de overeenkomst voor de hunt; voor deelnemers die niet zelf boekten: ons gerechtvaardigd belang om het geboekte spel te leveren'],
          ['Telefoonnummer van het team', 'Gerechtvaardigd belang: teams tijdens het spel kunnen bereiken, ook voor hun veiligheid'],
          ['Fotoboek en resultaten voor de klant', 'Uitvoering van de overeenkomst met de klant die de hunt boekte'],
          ['Technische meldingen en IP-adressen', 'Gerechtvaardigd belang: de app laten werken, storingen oplossen en misbruik voorkomen'],
          ['Toegang tot locatie, camera, microfoon, meldingen en galerij', 'Je toestemming via de vraag van je telefoon'],
        ]}
      />
      <h3>Hoe lang we gegevens bewaren</h3>
      <Table
        head={['Gegevens', 'Bewaartermijn']}
        rows={[
          ["Telefoonnummers, GPS-routes, foto's en video's, chat, de koppeling met je telefoon", '28 dagen na de hunt; als het fotoboek dan nog gedeeld is, tot het fotoboek verloopt'],
          ['Teamnaam', '28 dagen na de hunt; daarna wordt bijvoorbeeld "De Winnaars" "Team 3"'],
          ['Naam en laatste positie van spelleiders', 'Tot ze uitloggen, uiterlijk tot de hunt wordt opgeruimd'],
          ['Technische meldingen', '28 dagen'],
          ["Foto's en video's in je eigen galerij", 'Die staan op je eigen telefoon en beheer je zelf'],
        ]}
      />
      <p>
        Elke nacht verwijdert ons systeem automatisch de gegevens van hunts waarvan de termijn voorbij is. Daarna houden we
        alleen gegevens over die niet meer tot een persoon of team te herleiden zijn: de hunt (naam, datum, spel) en per team
        een volgnummer, taal, route, start- en eindtijd, afstand, uitkomst en de antwoorden per opdracht. De organisator kan
        een hunt ook eerder helemaal verwijderen; mail ons als je dat wilt.
      </p>
      <h3>Fotoboek en resultatenlink</h3>
      <p>
        Na de hunt kan de klant die de hunt boekte een digitaal fotoboek krijgen met een selectie van de foto&apos;s. Dat
        wordt gedeeld via een geheime link met wachtwoord en is 28 dagen te openen. Daarnaast kan de spelleiding een geheime
        resultatenlink delen met de ranglijst en de foto&apos;s van de hunt. Gedeelde links kunnen altijd worden ingetrokken.
        Wil je niet op foto&apos;s in het fotoboek of op de fotowall? Laat het de spelleiding of ons weten, dan halen we ze
        eruit.
      </p>

      <h2>4. Partijen die gegevens voor ons verwerken</h2>
      <p>
        We verkopen of verhuren je gegevens nooit. Voor de techniek werken we met de volgende verwerkers, met wie we
        afspraken hebben over het gebruik en de beveiliging van je gegevens.
      </p>
      <Table
        head={['Partij', 'Waarvoor', 'Waar']}
        rows={[
          [<a href="https://supabase.com/privacy">Supabase</a>, "Database, opslag van foto's en video's, inloggen en serverfuncties", 'EU (Frankfurt, Duitsland)'],
          [<a href="https://vercel.com/legal/privacy-policy">Vercel</a>, 'Hosting van de webversie, spellinks, fotoboek en resultaten (IP-adres)', 'Wereldwijd netwerk; bedrijf in de VS'],
          [<a href="https://expo.dev/privacy">Expo</a>, 'Updates van de app bij het opstarten (IP-adres, toestel- en appversie)', 'VS'],
          ['MapTiler of OpenFreeMap', 'Kaart van het speelveld laden (IP-adres en kaartgebied, niet je GPS-positie)', 'Zwitserland / EU'],
        ]}
      />
      <p>
        Voor Vercel en Expo in de VS gelden passende waarborgen: het EU-VS Data Privacy Framework en/of de
        standaardcontractbepalingen van de Europese Commissie. We gebruiken AI (Claude van Anthropic) alleen om spelteksten
        te vertalen; daarbij gaan geen gegevens van spelers mee. We geven gegevens alleen aan anderen als de wet ons daartoe
        verplicht.
      </p>

      <h2>5. Je rechten, beveiliging en contact</h2>
      <p>
        Je hebt het recht om je gegevens in te zien, te laten corrigeren of verwijderen, de verwerking te beperken, bezwaar te
        maken en je gegevens te ontvangen. Toestemming kun je altijd intrekken. Mail je verzoek naar {mail} met de naam en
        datum van de hunt en je teamnaam of teamcode. We reageren binnen een maand.
      </p>
      <p>
        Alle verbindingen zijn versleuteld (https). Toegangsregels in de database zorgen dat een team alleen de eigen gegevens
        ziet. Fotoboeken zijn beveiligd met een geheime link en een wachtwoord en verlopen automatisch. Bij een datalek melden
        we dat volgens de wet aan de Autoriteit Persoonsgegevens en, waar nodig, aan jou.
      </p>
      <p>
        De app vraagt niet naar leeftijd en is bedoeld voor groepen onder begeleiding. Spelen kinderen onder de 16 mee, dan
        doen ze dat onder verantwoordelijkheid van een ouder, voogd of de begeleiding van de groep.
      </p>
      <p>
        Niet tevreden? Laat het ons eerst weten. Je kunt ook een klacht indienen bij de{' '}
        <a href="https://www.autoriteitpersoonsgegevens.nl">Autoriteit Persoonsgegevens</a>. Als de app verandert, passen we
        deze verklaring aan; de versie bovenaan laat zien welke geldt.
      </p>
    </article>
  );
}
