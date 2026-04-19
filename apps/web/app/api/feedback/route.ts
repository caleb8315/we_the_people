import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  signal_id: z.string().uuid().optional(),
  briefing_id: z.string().uuid().optional(),
  kind: z.enum(['useful', 'noise', 'wrong', 'helpful_context']),
  note: z.string().max(400).optional(),
});

export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'feedback'), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  if (!parsed.data.signal_id && !parsed.data.briefing_id) {
    return NextResponse.json({ error: 'signal_id_or_briefing_id_required' }, { status: 400 });
  }

  const { error } = await sb.from('feedback').insert({ user_id: auth.user.id, ...parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
