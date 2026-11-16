// Edge function: resultaten van een sessie ophalen via de geheime link.
//
//   GET /functions/v1/results-export?token=<results_token>            → JSON
//   GET /functions/v1/results-export?token=<results_token>&format=csv → CSV (Excel)
//
// Bedoeld voor de deelbare resultatenpagina en voor tools die het fotoboek
// maken: per team plaats, punten, speeltijd, totaalafstand en foto-links.
// Foto-links zijn 7 dagen geldig. Werkt alleen als "resultaten delen" aan staat.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resultsToCsv, type SessionResults } from './format.ts';
import { signPhotoUrls } from './photo-store.ts';

const PHOTO_LINK_SECONDS = 7 * 24 * 60 * 60;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const format = url.searchParams.get('format') ?? 'json';
  if (req.method !== 'GET') return new Response('Alleen GET', { status: 405 });
  if (token.length < 24) return new Response('Ontbrekende of ongeldige token', { status: 400 });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc('shared_session_results', { p_token: token });
  if (error) return new Response('Resultaten niet gevonden of niet gedeeld', { status: 404 });
  const results = data as SessionResults;

  await signPhotoUrls(supabase, results.teams.flatMap((t) => t.photos), PHOTO_LINK_SECONDS);

  if (format === 'csv') {
    const name = results.session.name.replace(/[^\w-]+/g, '_');
    return new Response(resultsToCsv(results), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="resultaten-${name}.csv"`,
        'access-control-allow-origin': '*',
      },
    });
  }
  return Response.json(results, { headers: { 'access-control-allow-origin': '*' } });
});
