import { appleAppSiteAssociation } from '@/lib/event-links';

/**
 * /.well-known/apple-app-site-association (via een rewrite in next.config.ts):
 * vertelt de iPhone dat spellinks op dit domein de app openen.
 * Zet in Vercel APPLE_TEAM_ID (Team ID uit het Apple Developer-account).
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(appleAppSiteAssociation(process.env.APPLE_TEAM_ID), {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}
