/**
 * POST /api/vertalen: vertaalt de teksten van een opdracht met Claude.
 *
 * De API-sleutel (ANTHROPIC_API_KEY) staat alleen op de server (Vercel) en
 * komt nooit in de browser. Alleen ingelogde partners, beheerders en
 * eigenaren van een organisatie mogen vertalen.
 *
 * Invoer:  { source: "nl", targets: ["en", "de"], texts: { title: "…", "hint.0": "…" } }
 * Uitvoer: { translations: { en: { title: "…" }, de: { … } } }
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Vercel: een opdracht in vijf talen duurt meestal 10 tot 40 seconden. */
export const maxDuration = 120;

const MODEL = 'claude-opus-5-5';

const LANGUAGE_NAMES: Record<string, string> = {
  nl: 'Dutch',
  en: 'English',
  de: 'German',
  es: 'Spanish (Spain)',
  pt: 'Portuguese (Portugal)',
  it: 'Italian',
  fr: 'French',
};

const MAX_FIELDS = 120;
const MAX_CHARS = 40_000;

const SYSTEM = `You translate the player-facing texts of an outdoor GPS escape game / city hunt ("Escape Game The Hunt"), played by teams on their phones.

Rules:
- Translate faithfully and naturally, in the informal register players are addressed with in the source (Dutch "jullie/je" becomes informal in the target language where that is natural).
- Keep the tone: playful, short and clear. Do not add or leave out information.
- Some texts contain simple HTML for formatting (<p>, <br>, <b>, <i>, <u>, <span style>, <a href>, <ul>, <ol>, <li>, <div style>). Keep every tag, attribute and link exactly as it is, in the same order; translate only the visible text between the tags.
- Keep proper names unchanged: street names, buildings, squares, cities, people, brand and team names, and the game name "The Hunt".
- Keep numbers, codes, answers written in capitals, placeholders like {name} or {{name}}, emoji and line breaks as they are.
- Puzzles and riddles: translate them so they still work for the player. If a clue depends on Dutch wordplay or on a Dutch word the players must find on location (a sign, an inscription), keep that Dutch word as-is, and translate the rest around it.
- Answer options of a multiple-choice question are translated as short options, consistent with the question.
- Return a translation for every id in every requested language.`;

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/** Schema voor de uitvoer: een lijst met per id de vertaling in elke doeltaal. */
function outputSchema(targets: string[]) {
  const langs = Object.fromEntries(targets.map((l) => [l, { type: 'string' }]));
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, ...langs },
          required: ['id', ...targets],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  };
}

export async function POST(request: Request) {
  // 1. Wie vraagt dit? Alleen partner (editor) of hoger.
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Log opnieuw in om te vertalen.' });
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who, error: authError } = await db.auth.getUser(token);
  if (authError || !who.user || who.user.is_anonymous) return json(401, { error: 'Log opnieuw in om te vertalen.' });
  const { data: roles } = await db.from('memberships').select('role').eq('user_id', who.user.id);
  if (!(roles ?? []).some((r: { role: string }) => ['owner', 'admin', 'editor'].includes(r.role))) {
    return json(403, { error: 'Alleen beheerders en partners kunnen vertalen.' });
  }

  // 2. Invoer controleren.
  let input: { source?: unknown; targets?: unknown; texts?: unknown };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return json(400, { error: 'Ongeldige aanvraag.' });
  }
  const source = typeof input.source === 'string' ? input.source : '';
  const targets = Array.isArray(input.targets) ? [...new Set(input.targets.filter((l): l is string => typeof l === 'string'))] : [];
  const texts = input.texts && typeof input.texts === 'object' ? (input.texts as Record<string, unknown>) : {};
  const entries = Object.entries(texts).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== '');
  if (!LANGUAGE_NAMES[source] || targets.length === 0 || targets.some((l) => !LANGUAGE_NAMES[l] || l === source)) {
    return json(400, { error: 'Onbekende taal.' });
  }
  if (entries.length === 0) return json(200, { translations: Object.fromEntries(targets.map((l) => [l, {}])) });
  if (entries.length > MAX_FIELDS || entries.reduce((n, [, v]) => n + v.length, 0) > MAX_CHARS) {
    return json(413, { error: 'Te veel tekst om in één keer te vertalen.' });
  }

  const apiKey = readKey();
  if (!apiKey) {
    return json(503, { error: 'Vertalen is nog niet ingesteld: de sleutel ANTHROPIC_API_KEY ontbreekt op de server (Vercel). Zet hem bij Settings → Environment Variables en deploy opnieuw.' });
  }

  // 3. Vertalen. Ids zijn t0, t1, …, zodat veldnamen geen rol spelen.
  const ids = entries.map((_, i) => `t${i}`);
  const payload = entries.map(([, text], i) => ({ id: ids[i], text }));
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  try {
    // Streamen: de SDK weigert anders een aanvraag met een grote max_tokens.
    const response = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: outputSchema(targets) } },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content:
              `Translate from ${LANGUAGE_NAMES[source]} into: ${targets.map((l) => `${l} = ${LANGUAGE_NAMES[l]}`).join(', ')}.\n` +
              `Use the language codes as keys.\n\n${JSON.stringify(payload, null, 1)}`,
          },
        ],
      })
      .finalMessage();
    if (response.stop_reason === 'refusal') return json(422, { error: 'De vertaaldienst wilde deze tekst niet vertalen.' });
    if (response.stop_reason === 'max_tokens') return json(413, { error: 'Te veel tekst om in één keer te vertalen.' });
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let parsed: { items?: Record<string, string>[] };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      console.error('[vertalen] geen JSON van de vertaaldienst', response.stop_reason, text.slice(0, 500));
      return json(502, { error: `De vertaaldienst gaf een onverwacht antwoord (${response.stop_reason ?? 'onbekend'}). Probeer het opnieuw.` });
    }
    const translations: Record<string, Record<string, string>> = Object.fromEntries(targets.map((l) => [l, {}]));
    for (const item of parsed.items ?? []) {
      const i = ids.indexOf(item.id ?? '');
      if (i < 0) continue;
      const field = entries[i]![0];
      for (const l of targets) if (typeof item[l] === 'string' && item[l].trim()) translations[l]![field] = item[l].trim();
    }
    return json(200, { translations });
  } catch (err) {
    console.error('[vertalen]', err);
    return json(502, { error: describeError(err) });
  }
}

/** De sleutel zonder spaties of regeleinden (die komen makkelijk mee bij plakken). */
function readKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? '').trim().replace(/^["']|["']$/g, '');
}

/** Begrijpelijke melding per soort fout, met de technische reden erachter. */
function describeError(err: unknown): string {
  const detail = (err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ').slice(0, 300);
  if (err instanceof Anthropic.AuthenticationError) return 'De vertaalsleutel (ANTHROPIC_API_KEY) wordt niet geaccepteerd. Maak in console.anthropic.com een nieuwe sleutel en zet die in Vercel.';
  if (err instanceof Anthropic.PermissionDeniedError) return `De vertaalsleutel mag dit model niet gebruiken. (${detail})`;
  if (err instanceof Anthropic.NotFoundError) return `Het vertaalmodel is niet gevonden. (${detail})`;
  if (err instanceof Anthropic.RateLimitError) return 'Even te veel vertalingen tegelijk. Probeer het over een minuut opnieuw.';
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit|balance|billing/i.test(detail)) return 'Er staat geen (of te weinig) tegoed op het Anthropic-account. Zet tegoed op het account bij console.anthropic.com → Billing.';
    return `De vertaaldienst weigerde de aanvraag. (${detail})`;
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'De vertaaldienst reageerde niet op tijd. Probeer het opnieuw.';
  if (err instanceof Anthropic.APIConnectionError) return `Geen verbinding met de vertaaldienst. (${detail})`;
  if (err instanceof Anthropic.APIError) return `De vertaaldienst gaf een fout (${err.status ?? '?'}). (${detail})`;
  if (/header|ByteString|character/i.test(detail)) return 'De vertaalsleutel in Vercel bevat een ongeldig teken. Plak hem opnieuw, zonder spaties of aanhalingstekens.';
  return `Vertalen is mislukt. (${detail})`;
}

/**
 * GET /api/vertalen: controleert de instelling zonder iets te vertalen
 * (open dit adres in de browser). Zegt alleen of de sleutel er is en werkt.
 */
export async function GET() {
  const apiKey = readKey();
  if (!apiKey) return json(200, { sleutel: 'ontbreekt', uitleg: 'Zet ANTHROPIC_API_KEY in Vercel (Settings → Environment Variables) en deploy opnieuw.' });
  try {
    const model = await new Anthropic({ apiKey, maxRetries: 0 }).models.retrieve(MODEL);
    return json(200, { sleutel: 'werkt', model: model.id, uitleg: 'De sleutel en het model zijn in orde. Werkt vertalen toch niet, kijk dan of er tegoed op het account staat.' });
  } catch (err) {
    console.error('[vertalen] controle', err);
    return json(200, { sleutel: 'werkt niet', uitleg: describeError(err) });
  }
}
