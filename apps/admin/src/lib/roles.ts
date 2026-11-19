import type { Org } from './auth';
import { tKey } from './i18n';

/** Namen van de rollen (Nederlandse sleutels, vertaald met t()). */
export const ROLE_LABELS: Record<Org['role'], string> = {
  owner: tKey('Eigenaar'),
  admin: tKey('Beheerder'),
  editor: tKey('Redacteur'),
  instructor: tKey('Spelleider'),
};

/**
 * Naam van een rol. Bij een partner heet de hoogste rol (editor) gewoon
 * "Partner": eigenaar of beheerder bestaat daar niet.
 */
export function roleKey(role: Org['role'], platform: boolean): string {
  return !platform && role === 'editor' ? tKey('Partner') : ROLE_LABELS[role];
}
