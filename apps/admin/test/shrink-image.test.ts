import { describe, expect, it } from 'vitest';
import { shrinkSize, TASK_IMAGE_MAX_SIDE } from '../src/lib/shrink-image';

describe('foto bij een opdracht verkleinen', () => {
  it('verkleint een liggende en een staande telefoonfoto op de langste zijde', () => {
    expect(shrinkSize(8064, 6048)).toEqual({ width: TASK_IMAGE_MAX_SIDE, height: 1200 });
    expect(shrinkSize(3024, 4032)).toEqual({ width: 1200, height: TASK_IMAGE_MAX_SIDE });
  });

  it('houdt een panorama in verhouding', () => {
    expect(shrinkSize(12000, 1000)).toEqual({ width: 1600, height: 133 });
  });

  it('laat een kleine foto zoals hij is', () => {
    expect(shrinkSize(800, 600)).toBeNull();
    expect(shrinkSize(40, 30)).toBeNull();
  });
});
