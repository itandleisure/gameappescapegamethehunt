// node --test scripts/loquiz/convert.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, splitTitle, convertAnswer, firstImage } from './convert.mjs';

test('htmlToText maakt witregels van alinea\'s', () => {
  assert.equal(htmlToText('<p><strong>Kop</strong></p><p></p><p>Tekst &amp; meer</p>'), 'Kop\n\nTekst & meer');
});

test('splitTitle haalt de nummering weg', () => {
  assert.deepEqual(splitTitle('3/12 - Rugtas\nIn de tas'), { title: 'Rugtas', body: 'In de tas' });
});

test('number:range wordt getal met marge', () => {
  const { answer } = convertAnswer({ answerType: 'number:range', answers: [{ correct: true, min: 314, max: 413 }] });
  assert.deepEqual(answer, { type: 'number', value: 363.5, tolerance: 49.5 });
});

test('jokerteken blijft staan', () => {
  const { answer, warnings } = convertAnswer({ answerType: 'text', answers: [{ text: 'ver*', correct: true }] });
  assert.deepEqual(answer, { type: 'text', accepted: ['ver*'] });
  assert.equal(warnings.length, 0);
});

test('eerste afbeelding uit media of tekst', () => {
  assert.equal(firstImage({ media: [], text: '<p><img src="https://x/a.png" /></p>' }), 'https://x/a.png');
  assert.equal(firstImage({ media: [{ type: 'image', url: 'https://x/b.png' }], text: '' }), 'https://x/b.png');
});
