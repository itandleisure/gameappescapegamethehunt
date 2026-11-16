import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDuration, resultsToCsv, type SessionResults } from './format.ts';

const results: SessionResults = {
  session: { id: 's', name: 'Leeuwarden', starts_at: null, organization: 'Badass Games', logo_path: null },
  teams: [
    {
      rank: 1, id: 't1', name: 'De "Vossen"; team', track: 1, language: 'nl', score: 1900, outcome: 'ontsnapt',
      started_at: null, ended_at: null, duration_seconds: 3780, distance_m: 4235,
      photos: [{ task: 'fotomissie', path: 't1/fotomissie/1.jpg', taken_at: '', url: 'https://example.test/1.jpg' }],
    },
    {
      rank: 2, id: 't2', name: 'Wolven', track: 2, language: 'en', score: 1100, outcome: null,
      started_at: null, ended_at: null, duration_seconds: null, distance_m: 0, photos: [],
    },
  ],
};

test('speeltijd als minuten:seconden', () => {
  assert.equal(formatDuration(3780), '63:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(null), '');
});

test('CSV voor Excel en fotoboek', () => {
  const lines = resultsToCsv(results).replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], 'plaats;team;punten;speeltijd;speeltijd_seconden;afstand_km;uitkomst;track;taal;foto_1');
  assert.equal(lines[1], '1;"De ""Vossen""; team";1900;63:00;3780;4,24;ontsnapt;1;nl;https://example.test/1.jpg');
  assert.equal(lines[2], '2;Wolven;1100;;;0,00;;2;en;');
});
