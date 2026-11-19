import { androidAssetLinks } from '@/lib/event-links';

/**
 * /.well-known/assetlinks.json (via een rewrite in next.config.ts): vertelt
 * Android dat spellinks op dit domein de app openen. Zet in Vercel
 * ANDROID_SHA256_FINGERPRINTS (SHA-256 van de app-ondertekening uit Google Play
 * Console, meerdere gescheiden door een komma).
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(androidAssetLinks(process.env.ANDROID_SHA256_FINGERPRINTS), {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}
