import { describe, expect, it } from 'vitest';
import type { GamePackage } from '@hunt/engine';
import { applyGameSettings, countrySettings, DEFAULT_SETTINGS, parseSettings, withContact } from '../src/lib/org-settings.js';
import { bookText, defaultItems, footerText, mailBody } from '../src/lib/photobook.js';

describe('nieuwsflitsen', () => {
  it('zonder eigen knoppen de startset uit de app (null), automatische flitsen standaard aan', () => {
    expect(parseSettings({}).news).toEqual({ presets: null, auto: { escaped: true, puzzle: true, timeLeft: true } });
  });

  it('leest eigen knoppen en laat lege of foute weg', () => {
    const s = parseSettings({
      news: {
        auto: { puzzle: false, timeLeft: 'nee' },
        presets: [
          { id: 'a', icon: '🔥', title: { nl: ' Hunters op jacht ', xx: 'onbekend' }, body: { nl: '' } },
          { id: 'a', title: { en: 'Same id' } },
          { id: 'leeg', title: { nl: '  ' } },
          'onzin',
        ],
      },
    });
    expect(s.news.auto).toEqual({ escaped: true, puzzle: false, timeLeft: true });
    expect(s.news.presets).toEqual([
      { id: 'a', icon: '🔥', title: { nl: 'Hunters op jacht' } },
      { id: 'a-2', icon: '📣', title: { en: 'Same id' } },
    ]);
    // Bewust geen knoppen: een lege lijst blijft leeg.
    expect(parseSettings({ news: { presets: [] } }).news.presets).toEqual([]);
  });
});

describe('algemene instellingen', () => {
  it('vult ontbrekende of foute waarden met de standaard', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings({
      tickets: { timezone: 'Mars/Base', track_count: 500, team_chat: true },
      games: { max_accuracy: '25', boundary_color: 'rood', map_style: 'nacht' },
      countries: [{ country: 'es', language: 'xx' }, { country: 'ES' }, { country: 'ZZ' }],
      photobook: { share_days: 0, texts: { nl: { thanks: ' Dank! ', password: 'x' }, fr: { thanks: 'Merci' } } },
    });
    expect(s.tickets).toEqual({ timezone: 'Europe/Amsterdam', track_count: 50, team_chat: true, test_mode: false });
    expect(s.games.max_accuracy).toBe(25);
    expect(s.games.boundary_color).toBe(DEFAULT_SETTINGS.games.boundary_color);
    expect(s.games.map_style).toBe('nacht');
    expect(s.countries).toEqual([{ country: 'ES', language: 'es', timezone: 'Europe/Madrid' }]);
    expect(s.photobook.share_days).toBe(1);
    expect(s.photobook.texts).toEqual({ nl: { thanks: 'Dank!' } });
  });

  it('kent per land een taal en tijdzone, ook buiten de eigen lijst', () => {
    const s = parseSettings({ countries: [{ country: 'ES', language: 'en', timezone: 'Atlantic/Canary' }] });
    expect(countrySettings(s, 'ES')).toEqual({ country: 'ES', language: 'en', timezone: 'Atlantic/Canary' });
    expect(countrySettings(s, 'DE').language).toBe('de');
  });

  it('zet GPS altijd en de rest alleen als het spel niets kiest', () => {
    const pkg = {
      gps: { maxAccuracy: 30 },
      meetingPoint: { lat: 1, lng: 2, text: {} },
      boundary: { points: [], color: '#000000' },
    } as unknown as GamePackage;
    const games = { ...DEFAULT_SETTINGS.games, max_accuracy: 40, decline_seconds: 30, meeting_radius: 35, map_style: 'nacht', outside_color: '#111111' };
    const out = applyGameSettings(pkg, games);
    expect(out.gps).toEqual({ maxAccuracy: 40, declineSeconds: 30 });
    expect(out.meetingPoint?.radius).toBe(35);
    expect(out.map?.styleUrl).toMatch(/nacht/);
    expect(out.boundary?.color).toBe('#000000');
    expect(out.boundary?.outsideColor).toBe('#111111');
    // Standaardkaartstijl: het pakket blijft zonder eigen kaart.
    expect(applyGameSettings(pkg, DEFAULT_SETTINGS.games).map).toBeUndefined();
  });

  it('Hunter in de buurt: standaard 100 m, een eigen keuze van het spel blijft', () => {
    const pkg = { gps: { maxAccuracy: 30 } } as unknown as GamePackage;
    expect(applyGameSettings(pkg, DEFAULT_SETTINGS.games).hunterAlert).toEqual({ radius: 100 });
    expect(applyGameSettings(pkg, { ...DEFAULT_SETTINGS.games, hunter_alert_radius: 0 }).hunterAlert).toEqual({ radius: 0 });
    expect(applyGameSettings({ ...pkg, hunterAlert: { radius: 50 } }, DEFAULT_SETTINGS.games).hunterAlert).toEqual({ radius: 50 });
    expect(parseSettings({ games: { hunter_alert_radius: 9999 } }).games.hunter_alert_radius).toBe(500);
  });

  it('fotoboek: eigen naam, eigen teksten en contactgegevens', () => {
    const brand = { name: 'Stadsjacht', group: 'Spelgroep', texts: { nl: { thanks: 'Tot ziens, {n}!' } } };
    expect(bookText('nl', 'thanks', { n: 'team' }, brand)).toBe('Tot ziens, team!');
    expect(bookText('en', 'moreGames', undefined, brand)).toBe('More games by Spelgroep');
    expect(bookText('nl', 'huntIn', undefined, brand)).toBe('Stadsjacht in');
    expect(footerText('Gent', brand.name)).toBe('STADSJACHT · GENT');
    expect(mailBody('nl', 'X', 'https://l', 'PW', null, brand).body).toMatch(/Stadsjacht!.*\n[\s\S]*\nStadsjacht$/);
    expect(withContact({ website: 'oud.nl', video: 'v' }, { ...DEFAULT_SETTINGS.company, website: 'nieuw.nl', email: 'a@b.nl' })).toEqual({
      website: 'nieuw.nl',
      video: 'v',
      email: 'a@b.nl',
    });
    expect(defaultItems([], [], () => '', ['a', 'b', 'c'], 2).map((i) => i.path)).toEqual(['a', 'b']);
  });
});
