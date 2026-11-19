import { describe, expect, it } from 'vitest';
import { distanceText, MeetingArrival, MEETING_NO_GPS_MS } from '../src/core/meeting';

// Verzamelpunt met de standaardstraal van 20 m; 0,0001 graad noord is ongeveer 11 m.
const point = { lat: 53.2, lng: 5.8, radius: 20 };
const at = (meters: number, accuracy: number, t: number) => ({ lat: point.lat + meters / 111_195, lng: point.lng, accuracy, at: t });

describe('lopen naar het verzamelpunt', () => {
  it('is er na twee goede metingen in de cirkel', () => {
    const a = new MeetingArrival(point, 30, 0);
    expect(a.feed(at(200, 10, 1_000))).toBe(false);
    expect(a.feed(at(10, 10, 2_000))).toBe(false);
    expect(a.feed(at(8, 10, 3_000))).toBe(true);
  });

  it('telt een zwakke meting mee als de onzekerheid de cirkel raakt', () => {
    const a = new MeetingArrival(point, 30, 0);
    expect(a.feed(at(60, 50, 1_000))).toBe(false);
    expect(a.feed(at(60, 50, 2_000))).toBe(true);
  });

  it('laat een heel slechte meting niets doen', () => {
    const a = new MeetingArrival(point, 30, 0);
    a.feed(at(5, 300, 1_000));
    expect(a.feed(at(5, 300, 2_000))).toBe(false);
  });

  it('is er niet op 57 km afstand', () => {
    const a = new MeetingArrival(point, 30, 0);
    a.feed(at(57_000, 5, 1_000));
    expect(a.feed(at(57_000, 5, 2_000))).toBe(false);
  });

  it('meldt dat de GPS niet werkt na een halve minuut zonder bruikbare meting', () => {
    const a = new MeetingArrival(point, 30, 0);
    expect(a.gpsFailing(MEETING_NO_GPS_MS)).toBe(false);
    expect(a.gpsFailing(MEETING_NO_GPS_MS + 1)).toBe(true);
    a.feed(at(100, 10, 40_000));
    expect(a.gpsFailing(41_000)).toBe(false);
    a.feed(at(100, 500, 80_000));
    expect(a.gpsFailing(80_000)).toBe(true);
  });
});

describe('afstand als tekst', () => {
  it('meters dichtbij, kilometers ver weg', () => {
    expect(distanceText(349.6, 'nl')).toEqual({ key: 'distanceLeft', vars: { meters: 350 } });
    expect(distanceText(2_340, 'nl')).toEqual({ key: 'distanceLeftKm', vars: { km: '2,3' } });
    expect(distanceText(2_340, 'en')).toEqual({ key: 'distanceLeftKm', vars: { km: '2.3' } });
    expect(distanceText(57_027, 'nl')).toEqual({ key: 'distanceLeftKm', vars: { km: '57' } });
  });
});
