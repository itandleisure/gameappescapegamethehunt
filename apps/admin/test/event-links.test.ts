import { describe, expect, it } from 'vitest';
import {
  androidAssetLinks,
  appleAppSiteAssociation,
  appSchemeUrl,
  isEventLinkPath,
  normalizeGameId,
  parseEventLink,
  playUrl,
  resultsUrl,
} from '../src/lib/event-links.js';

describe('spellinks /<game-ID>:<spelcode>', () => {
  it('leest game-ID en spelcode', () => {
    expect(parseEventLink('the-hunt-leeuwarden:ABC12')).toEqual({ gameId: 'the-hunt-leeuwarden', code: 'ABC12' });
    expect(parseEventLink('the-hunt-leeuwarden%3Aabc12')).toEqual({ gameId: 'the-hunt-leeuwarden', code: 'ABC12' });
    expect(parseEventLink('/Leeuwarden:abc-12/')).toEqual({ gameId: 'leeuwarden', code: 'ABC12' });
    expect(parseEventLink('ABC12')).toEqual({ gameId: '', code: 'ABC12' });
    expect(parseEventLink('leeuwarden:AB')).toBeNull();
    expect(parseEventLink('leeuwarden:')).toBeNull();
  });

  it('maakt een leesbaar game-ID', () => {
    expect(normalizeGameId('The Hunt Léeuwarden ')).toBe('the-hunt-leeuwarden');
    expect(normalizeGameId('--a--b--')).toBe('a-b');
  });

  it('bouwt de links', () => {
    const link = { gameId: 'leeuwarden', code: 'ABC12' };
    expect(playUrl(link, 'https://thehunt.badassgames.nl')).toBe('https://thehunt.badassgames.nl/leeuwarden:ABC12');
    expect(resultsUrl(link, 'https://beheer.example')).toBe('https://beheer.example/resultaten/leeuwarden:ABC12');
    expect(appSchemeUrl(link)).toBe('thehunt:///?code=ABC12&game=leeuwarden');
  });

  it('herkent de openbare spellinkpagina', () => {
    expect(isEventLinkPath('/leeuwarden:ABC12')).toBe(true);
    expect(isEventLinkPath('/leeuwarden%3AABC12')).toBe(true);
    expect(isEventLinkPath('/sessies')).toBe(false);
    expect(isEventLinkPath('/resultaten/leeuwarden:ABC12')).toBe(false);
  });

  it('app-links voor iPhone en Android', () => {
    const apple = appleAppSiteAssociation('ABCDE12345');
    expect(apple.applinks.details[0]!.appIDs).toEqual(['ABCDE12345.com.thebadassgroup.thehunt']);
    expect(apple.applinks.details[0]!.components[0]).toMatchObject({ '/': '/resultaten/*', exclude: true });
    expect(androidAssetLinks('aa:bb, cc:dd')[0]!.target.sha256_cert_fingerprints).toEqual(['AA:BB', 'CC:DD']);
    expect(androidAssetLinks(undefined)).toEqual([]);
  });
});
