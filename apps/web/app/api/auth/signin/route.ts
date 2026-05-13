import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * POST /api/auth/signin
 * Simple email/password login. Open to any registered Supabase user.
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'signin'), 10, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_credentials' }, { status: 400 });

  const email = parsed.data.email.toLowerCase();

  const sb = getServerSupabase();
  const { error } = await sb.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 401 });
  return NextResponse.json({ ok: true });
}
