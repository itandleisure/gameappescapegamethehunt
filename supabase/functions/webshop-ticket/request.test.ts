import assert from 'node:assert/strict';
import { test } from 'node:test';
import { httpError, parseOrder, playLink, readKey } from './request.ts';

test('leest de webshopsleutel uit de headers', () => {
  assert.equal(readKey(new Headers({ authorization: 'Bearer whk_abc' })), 'whk_abc');
  assert.equal(readKey(new Headers({ 'x-webshop-key': ' whk_def ' })), 'whk_def');
  assert.equal(readKey(new Headers()), '');
});

test('controleert de bestelling', () => {
  assert.deepEqual(parseOrder({ game: 'the-hunt-leeuwarden', teams: 4, order: 1001 }), {
    ok: true,
    order: { game: 'the-hunt-leeuwarden', teams: 4, order: '1001' },
  });
  const full = parseOrder({ game: 'x', teams: '4', order: 'A', name: ' Jansen ', starts_at: '2026-12-05T14:00:00+01:00' });
  assert.ok(full.ok);
  assert.equal(full.ok && full.order.teams, 4);
  assert.equal(full.ok && full.order.name, 'Jansen');
  assert.equal(full.ok && full.order.starts_at, '2026-12-05T13:00:00.000Z');
  for (const bad of [null, [], {}, { game: 'x', teams: 0, order: 'A' }, { game: 'x', teams: 2.5, order: 'A' }, { game: 'x', teams: 4 }, { game: 'x', teams: 4, order: 'A', starts_at: 'morgen' }]) {
    assert.equal(parseOrder(bad).ok, false, JSON.stringify(bad));
  }
});

test('maakt de spellink en vertaalt fouten', () => {
  assert.equal(playLink('escapegamethehunt.badassgames.nl/', 'the-hunt-leeuwarden', 'K7QX2'), 'https://escapegamethehunt.badassgames.nl/the-hunt-leeuwarden:K7QX2');
  assert.equal(httpError({ code: '28000' }).status, 401);
  assert.equal(httpError({ code: 'P0002', message: 'onbekend spel x' }).status, 404);
  assert.equal(httpError({ code: 'XX000' }).status, 500);
});
