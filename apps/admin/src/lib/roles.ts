import type { Org } from './auth';
import { tKey } from './i18n';

/**
 * Namen van de rollen (Nederlandse sleutels, vertaald met t()). De rol editor
 * bestaat alleen bij partners en heet daarom "Partner"; eigen collega's van het
 * platform zijn eigenaar, beheerder of spelleider.
 */
export const ROLE_LABELS: Record<Org['role'], string> = {
  owner: tKey('Eigenaar'),
  admin: tKey('Beheerder'),
  editor: tKey('Partner'),
  instructor: tKey('Spelleider'),
};

/**
 * Rollen die het platform aan eigen collega's geeft. Een spelleider krijgt geen
 * account maar de spelleider-link van een hunt; bestaande spelleider-accounts
 * kunnen alleen nog kijken.
 */
export const PLATFORM_ROLES: Org['role'][] = ['owner', 'admin'];
/** Rollen bij een partner: nooit eigenaar of beheerder. */
export const PARTNER_ROLES: Org['role'][] = ['editor'];

export function roleKey(role: Org['role']): string {
  return ROLE_LABELS[role];
}
