import { describe, expect, it } from 'vitest';
import { findPageImage, isPublicHost, isPublicUrl } from '../src/lib/page-image.js';

describe('voorbeeldfoto van een pagina', () => {
  const base = 'https://badassgames.nl/the-hundred';

  it('neemt og:image, ook met een relatieve link en &amp;', () => {
    expect(findPageImage('<meta property="og:image" content="/img/hundred.jpg?w=1&amp;h=2">', base)).toBe(
      'https://badassgames.nl/img/hundred.jpg?w=1&h=2',
    );
    expect(findPageImage(`<meta content='https://cdn.x.nl/a.png' property='og:image'/>`, base)).toBe('https://cdn.x.nl/a.png');
  });

  it('valt terug op twitter:image, image_src en de eerste gewone foto', () => {
    expect(findPageImage('<meta name="twitter:image" content="https://x.nl/t.jpg">', base)).toBe('https://x.nl/t.jpg');
    expect(findPageImage('<link rel="image_src" href="s.jpg">', base)).toBe('https://badassgames.nl/s.jpg');
    expect(findPageImage('<img src="/logo.png"><img src="data:image/gif;base64,x"><img src="/foto/kist.webp">', base)).toBe(
      'https://badassgames.nl/foto/kist.webp',
    );
    expect(findPageImage('<p>geen foto</p>', base)).toBeNull();
  });

  it('haalt alleen gewone websites op', () => {
    expect(isPublicUrl('https://badassgames.nl/x')).toBe(true);
    expect(isPublicUrl('http://localhost:3000')).toBe(false);
    expect(isPublicUrl('http://127.0.0.1/')).toBe(false);
    expect(isPublicUrl('http://169.254.169.254/latest')).toBe(false);
    expect(isPublicUrl('https://10.0.0.5/')).toBe(false);
    expect(isPublicUrl('https://[::1]/')).toBe(false);
    expect(isPublicUrl('file:///etc/passwd')).toBe(false);
    expect(isPublicUrl('https://user:pw@badassgames.nl/')).toBe(false);
    expect(isPublicUrl('https://badassgames.nl:8080/')).toBe(false);
    expect(isPublicHost('192.168.1.1')).toBe(false);
    expect(isPublicHost('::ffff:10.0.0.1')).toBe(false);
    expect(isPublicHost('8.8.8.8')).toBe(true);
    expect(isPublicHost('intranet')).toBe(false);
  });
});
