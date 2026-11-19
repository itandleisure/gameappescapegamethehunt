import { currentLocale, t } from './i18n';

export type SessionStatus = 'draft' | 'open' | 'closed';

export interface SessionInput {
  name: string;
  gameVersionId: string;
  startsAt: string; // datetime-local, in de tijdzone van de sessie
  timezone: string;
  trackCount: number;
  testMode: boolean;
  /** De spelleider start het spel voor alle teams tegelijk. */
  /** Teams kunnen elkaar berichten sturen (de spelleiding leest mee). */
  teamChat?: boolean;
  /** Eigen sessiecode; leeg = de database kiest er een van 5 tekens. */
  joinCode?: string;
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  draft: 'Concept',
  open: 'Open',
  closed: 'Gesloten',
};

/** Tijdzones voor sessies in Europa; de database accepteert elke geldige zone. */
export const TIMEZONES = [
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Lisbon',
  'Europe/Rome',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Vienna',
  'Europe/Prague',
  'Europe/Warsaw',
  'Europe/Copenhagen',
  'Europe/Stockholm',
  'Europe/Athens',
  'Europe/Sofia',
];

/**
 * Sessiecode uit vrije tekst, zoals een bedrijfsnaam: hoofdletters, zonder
 * accenten, spaties of leestekens, hooguit 12 tekens. "Van Dijk B.V." wordt VANDIJKBV.
 */
export function toJoinCode(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

export function validateSession(input: SessionInput): string[] {
  const errors: string[] = [];
  if (input.name.trim().length < 2) errors.push(t('Geef het event een naam.'));
  if (!input.gameVersionId) errors.push(t('Kies een spel.'));
  if (!Number.isInteger(input.trackCount) || input.trackCount < 1 || input.trackCount > 50) {
    errors.push(t('Aantal tracks moet tussen 1 en 50 liggen.'));
  }
  const code = input.joinCode?.trim() ?? '';
  if (code && !/^[A-Za-z0-9]{4,12}$/.test(code)) errors.push(t('De eventcode moet 4 tot 12 letters of cijfers zijn, zonder spaties.'));
  if (input.startsAt && Number.isNaN(Date.parse(input.startsAt))) errors.push(t('Startmoment is ongeldig.'));
  return errors;
}

/**
 * Zet een lokale datum-tijd (zoals een datetime-local-veld die geeft) in een
 * bepaalde tijdzone om naar een ISO-tijdstip in UTC.
 */
export function zonedToUtc(local: string, timeZone: string): string {
  const [date, time = '00:00'] = local.split('T');
  const [y, m, d] = date!.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  // Verschil tussen UTC en de tijdzone op dat moment (twee keer, rond zomertijd).
  const offset = (at: number) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(at));
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - at;
  };
  let utc = guess - offset(guess);
  utc = guess - offset(utc);
  return new Date(utc).toISOString();
}

export function formatInZone(iso: string | null, timeZone: string): string {
  if (!iso) return '–';
  return new Intl.DateTimeFormat(currentLocale(), { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
