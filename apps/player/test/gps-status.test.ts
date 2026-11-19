import { describe, expect, it } from 'vitest';
import { AWAY_NOTICE_FOR_MS, GpsMonitor } from '../src/core/gps-status';

describe('GPS-melding in de webapp', () => {
  it('is uit tot het spel start', () => {
    expect(new GpsMonitor().status(0).state).toBe('off');
  });

  it('wacht eerst op een meting en is daarna goed', () => {
    const gps = new GpsMonitor(30_000);
    gps.start(0);
    expect(gps.status(5_000).state).toBe('waiting');
    gps.fix(6_000);
    expect(gps.status(10_000).state).toBe('ok');
  });

  it('meldt weggevallen GPS na 30 seconden zonder meting', () => {
    const gps = new GpsMonitor(30_000);
    gps.start(0);
    gps.fix(1_000);
    expect(gps.status(31_000).state).toBe('ok');
    expect(gps.status(31_001).state).toBe('lost');
    gps.fix(40_000);
    expect(gps.status(40_500).state).toBe('ok');
  });

  it('meldt het ook als er nooit een meting kwam', () => {
    const gps = new GpsMonitor(30_000);
    gps.start(0);
    expect(gps.status(30_001).state).toBe('lost');
  });

  it('geen toestemming gaat voor alles', () => {
    const gps = new GpsMonitor();
    gps.start(0);
    gps.deny();
    expect(gps.status(1).state).toBe('denied');
    gps.fix(2);
    expect(gps.status(3).state).toBe('ok');
  });

  it('vertelt na terugkomen hoe lang de app weg was, en wacht dan weer even', () => {
    const gps = new GpsMonitor(30_000);
    gps.start(0);
    gps.fix(1_000);
    gps.hide(2_000);
    gps.show(122_000);
    const back = gps.status(122_000);
    expect(back.awayMs).toBe(120_000);
    // Geen "weggevallen" direct na terugkomen: de browser zoekt opnieuw.
    expect(back.state).toBe('waiting');
    gps.fix(124_000);
    expect(gps.status(125_000).state).toBe('ok');
    // De melding verdwijnt vanzelf, of met wegklikken.
    expect(gps.status(122_000 + AWAY_NOTICE_FOR_MS + 1).awayMs).toBe(0);
    gps.hide(200_000);
    gps.show(260_000);
    gps.dismissAway();
    expect(gps.status(260_001).awayMs).toBe(0);
  });

  it('meldt kort weg (een paar seconden) niet', () => {
    const gps = new GpsMonitor();
    gps.start(0);
    gps.hide(1_000);
    gps.show(3_000);
    expect(gps.status(3_000).awayMs).toBe(0);
  });

  it('meldt niets als het spel nog niet liep', () => {
    const gps = new GpsMonitor();
    gps.hide(0);
    gps.show(60_000);
    gps.start(60_000);
    expect(gps.status(60_000).awayMs).toBe(0);
  });
});

describe('teksten van de webapp', () => {
  it('heeft alle teksten in elke taal, met Engels als terugval', async () => {
    const { webMsg } = await import('../src/core/web-i18n');
    for (const lang of ['nl', 'en', 'de', 'fr', 'es', 'pt', 'it']) {
      expect(webMsg(lang, 'webAway', { time: '2:05' })).toContain('2:05');
    }
    expect(webMsg('pl', 'webKeepOnTitle')).toBe('Keep this screen on');
    const { shortDuration } = await import('../src/core/web-i18n');
    expect(shortDuration(6_000)).toBe('6 sec');
    expect(shortDuration(150_000)).toBe('3 min');
  });
});
