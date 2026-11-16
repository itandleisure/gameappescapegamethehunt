/**
 * Verdeelt teams op volgorde van inloggen over de tracks:
 * team 1 → track 1, …, team 5 → track 5, team 6 → weer track 1.
 *
 * @param loginOrder volgnummer van het team in de sessie, vanaf 1
 * @param trackCount aantal tracks in de sessie (standaard 5)
 */
export function assignTrack(loginOrder: number, trackCount = 5): number {
  if (!Number.isInteger(loginOrder) || loginOrder < 1) throw new RangeError('loginOrder moet ≥ 1 zijn');
  if (!Number.isInteger(trackCount) || trackCount < 1) throw new RangeError('trackCount moet ≥ 1 zijn');
  return ((loginOrder - 1) % trackCount) + 1;
}
