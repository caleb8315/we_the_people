import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getAdminSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email(),
  reason: z.string().max(500).optional(),
});

/**
 * POST /api/auth/request — creates/updates a pending access request.
 * Operator reviews in Supabase → public.access_requests, flips status
 * to 'approved' to auto-add the email to beta_allowlist.
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'access-request'), 3, 15 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const reason = parsed.data.reason?.slice(0, 500) ?? null;

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 32);
  const referrer = req.headers.get('referer') ?? null;
  const ua = req.headers.get('user-agent')?.slice(0, 200) ?? null;

  const sb = getAdminSupabase();
  const { error } = await sb.from('access_requests').upsert(
    {
      email,
      reason,
      referrer,
      user_agent: ua,
      ip_hash: ipHash,
    },
    { onConflict: 'email', ignoreDuplicates: false },
  );

  if (error) {
    console.error('[auth/request] insert failed:', error.message);
    // Generic response — never leak enumeration info.
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
