import { describe, expect, it } from 'vitest';
import { blocksToHtml, isRich, parseRich, richToPlain, sanitizeRich } from '../src/richtext.js';

describe('opgemaakte tekst', () => {
  it('laat gewone tekst ongemoeid', () => {
    const plain = 'Eerste regel.\n\nKlik op OK, 3 < 4 & zo.';
    expect(isRich(plain)).toBe(false);
    expect(parseRich(plain)).toHaveLength(3);
    expect(sanitizeRich(blocksToHtml(parseRich(plain)))).toBe(plain);
    expect(richToPlain(plain)).toBe(plain);
  });

  it('bewaart vet, cursief, kleur, link en uitlijning', () => {
    const html =
      '<p style="text-align: center;">Klik op <strong>OK</strong> om <span style="color: rgb(245, 165, 36);">verder</span> te <a href="https://x.nl" onclick="kwaad()">gaan</a>.</p><p><br></p><p><em>Succes</em></p>';
    const blocks = parseRich(html);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]!.align).toBe('center');
    expect(blocks[0]!.spans).toEqual([
      { text: 'Klik op ' },
      { text: 'OK', bold: true },
      { text: ' om ' },
      { text: 'verder', color: '#f5a524' },
      { text: ' te ' },
      { text: 'gaan', href: 'https://x.nl' },
      { text: '.' },
    ]);
    expect(blocks[1]!.spans).toEqual([]);
    const clean = sanitizeRich(html);
    expect(clean).not.toContain('onclick');
    expect(sanitizeRich(clean)).toBe(clean);
    expect(richToPlain(clean)).toBe('Klik op OK om verder te gaan.\n\nSucces');
  });

  it('maakt opmaak zonder effect weer gewone tekst', () => {
    expect(sanitizeRich('<div>Regel een</div><div><br></div><div>Regel&nbsp;twee</div>')).toBe('Regel een\n\nRegel twee');
    expect(sanitizeRich('<p><br></p>')).toBe('');
  });

  it('leest lijsten en gooit gevaarlijke inhoud weg', () => {
    const html = '<ol><li>Een</li><li>Twee</li></ol><ul><li>Los</li></ul><script>alert(1)</script><a href="javascript:alert(1)">x</a>';
    const blocks = parseRich(html);
    expect(blocks.map((b) => b.list)).toEqual(['ol', 'ol', 'ul', undefined]);
    expect(blocks[3]!.spans).toEqual([{ text: 'x' }]);
    expect(richToPlain(html)).toBe('1. Een\n2. Twee\n• Los\nx');
    expect(sanitizeRich(html)).toBe('<ol><li>Een</li><li>Twee</li></ol><ul><li>Los</li></ul><p>x</p>');
  });

  it('plakken uit Word of een website levert schone tekst', () => {
    const pasted = '<meta charset="utf-8"><style>p{color:red}</style><p class="MsoNormal"><span style="font-weight: 700; font-family: Calibri">Let op</span><o:p></o:p></p>';
    expect(sanitizeRich(pasted)).toBe('<p><b>Let op</b></p>');
  });
});
