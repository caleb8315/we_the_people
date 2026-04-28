import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { isEmailAllowed } from '@/lib/allowlist';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(120),
  display_name: z.string().min(2).max(40).optional(),
});

/**
 * POST /api/auth/signup
 * Simple email/password signup.
 *
 * NOTE: For immediate login during MVP, disable email confirmation in
 * Supabase Auth settings.
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'signup'), 5, 15 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const sb = getServerSupabase();
  const email = parsed.data.email.toLowerCase();
  const allowed = await isEmailAllowed(email);
  if (!allowed) {
    // Keep the beta gate explicit for signups while avoiding extra detail
    // about whether an address is already known to the system.
    return NextResponse.json({ error: 'invite_required' }, { status: 403 });
  }

  const { error } = await sb.auth.signUp({
    email,
    password: parsed.data.password,
    options: {
      data: {
        display_name: parsed.data.display_name ?? null,
      },
    },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
