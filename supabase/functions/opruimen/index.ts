// Edge function: persoonsgegevens van oude hunts opruimen (bewaartermijn 28 dagen).
//
//   POST /functions/v1/opruimen   → { "opgeruimd": <aantal hunts> }
//
// Draait elke nacht via pg_cron (migratie 20261119930000_bewaartermijn). Per
// hunt waarvan de termijn voorbij is: eerst de foto's en fotoboekbestanden uit
// de opslag, daarna anonymize_session() in de database. Iedereen mag deze
// functie aanroepen: hij doet alleen wat toch al moet gebeuren, en geeft geen
// gegevens terug.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BATCH = 100;

interface Expired {
  session_id: string;
  photo_paths: string[];
  photobook_paths: string[];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Alleen POST', { status: 405 });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc('expired_sessions');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let done = 0;
  const failed: string[] = [];
  for (const session of (data ?? []) as Expired[]) {
    try {
      for (const [bucket, paths] of [['photos', session.photo_paths], ['photobooks', session.photobook_paths]] as const) {
        for (let i = 0; i < paths.length; i += BATCH) {
          const { error: removeError } = await supabase.storage.from(bucket).remove(paths.slice(i, i + BATCH));
          if (removeError) throw removeError;
        }
      }
      const { error: anonError } = await supabase.rpc('anonymize_session', { p_session: session.session_id });
      if (anonError) throw anonError;
      done += 1;
    } catch (e) {
      console.error('[opruimen]', session.session_id, e);
      failed.push(session.session_id);
    }
  }
  return Response.json({ opgeruimd: done, mislukt: failed.length });
});
