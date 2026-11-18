import { describe, expect, it } from 'vitest';
import { fitImage, photoResize, PHOTO_MAX_SIDE } from '../src/core/photo.js';

describe('foto verkleinen voor het versturen', () => {
  it('maakt een liggende 48-megapixelfoto 2048 breed', () => {
    expect(photoResize(8064, 6048)).toEqual({ width: PHOTO_MAX_SIDE });
  });

  it('maakt een staande foto 2048 hoog, niet 2048 breed (dat zou 2730 hoog worden)', () => {
    expect(photoResize(3024, 4032)).toEqual({ height: PHOTO_MAX_SIDE });
  });

  it('verkleint een panorama op de breedte en een hele lange foto op de hoogte', () => {
    expect(photoResize(12000, 2000)).toEqual({ width: PHOTO_MAX_SIDE });
    expect(photoResize(1000, 9000)).toEqual({ height: PHOTO_MAX_SIDE });
  });

  it('vergroot een kleine foto niet (oude telefoon, lage camerastand)', () => {
    expect(photoResize(640, 480)).toBeNull();
    expect(photoResize(2048, 1536)).toBeNull();
  });

  it('verkleint ook als de camera geen maten doorgeeft', () => {
    expect(photoResize(0, 0)).toEqual({ width: PHOTO_MAX_SIDE });
  });
});

describe('foto bij een opdracht tonen', () => {
  const phone = { width: 343, maxHeight: 500 };

  it('toont een gewone foto over de hele breedte in de eigen verhouding', () => {
    expect(fitImage({ width: 1200, height: 900 }, phone)).toEqual({ width: 343, height: 257 });
  });

  it('houdt een enorme foto binnen het scherm', () => {
    expect(fitImage({ width: 8000, height: 6000 }, phone)).toEqual({ width: 343, height: 257 });
  });

  it('maakt een hele lange foto niet hoger dan toegestaan, en dan smaller', () => {
    expect(fitImage({ width: 300, height: 3000 }, phone)).toEqual({ width: 50, height: 500 });
  });

  it('houdt een panorama op schermbreedte, met een lage hoogte', () => {
    expect(fitImage({ width: 3000, height: 300 }, phone)).toEqual({ width: 343, height: 34 });
  });

  it('blaast een piepkleine foto hoogstens drie keer op', () => {
    expect(fitImage({ width: 40, height: 30 }, phone)).toEqual({ width: 120, height: 90 });
  });

  it('gebruikt 4:3 zolang de maten nog niet bekend zijn', () => {
    expect(fitImage(null, phone)).toEqual({ width: 343, height: 257 });
  });

  it('past op een tablet binnen de maximale breedte', () => {
    expect(fitImage({ width: 4000, height: 3000 }, { width: 600, maxHeight: 900 })).toEqual({ width: 600, height: 450 });
  });
});
