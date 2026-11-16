// Foto-links maken, los van waar de foto's staan.
//
// Nu staan alle foto's in Supabase Storage. Bij groei (duizenden foto's per
// dag) kan nieuwe opslag naar Cloudflare R2 (geen kosten voor downloaden):
// voeg dan hier een R2-variant toe en laat de app nieuwe foto's daar uploaden.
// Oude foto's blijven werken, omdat elke foto zijn eigen storage_provider heeft.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { ResultPhoto } from './format.ts';

export async function signPhotoUrls(supabase: SupabaseClient, photos: ResultPhoto[], seconds: number): Promise<void> {
  const fromSupabase = photos.filter((p) => (p.provider ?? 'supabase') === 'supabase');
  if (fromSupabase.length) {
    const { data } = await supabase.storage.from('photos').createSignedUrls(fromSupabase.map((p) => p.path), seconds);
    const byPath = new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
    for (const photo of fromSupabase) photo.url = byPath.get(photo.path) ?? undefined;
  }
  // 'r2': nog niet in gebruik. Een R2-variant maakt hier een presigned URL.
}
