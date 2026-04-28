import { siteConfig } from '@/lib/site-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const body = [
    `Contact: mailto:${siteConfig.securityEmail}`,
    `Expires: 2027-04-28T00:00:00.000Z`,
    `Preferred-Languages: en`,
    `Canonical: ${siteConfig.siteUrl}/.well-known/security.txt`,
    `Policy: ${siteConfig.siteUrl}/privacy`,
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
