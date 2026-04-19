import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  model: z.string().min(2).max(80).optional(),
  system_prompt: z.string().min(20).max(3000).optional(),
  temperature: z.number().min(0).max(1).optional(),
  max_output_tokens: z.number().int().min(64).max(4000).optional(),
});

export async function GET(req: Request) {
  const rl = limit(getClientKey(req, 'ai-profile-get'), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('ai_profiles')
    .select('*')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) {
    return NextResponse.json({
      profile: {
        user_id: auth.user.id,
        model: 'gemini-2.0-flash',
        system_prompt: 'You are a neutral OSINT analyst. Cite evidence and avoid accusations.',
        temperature: 0.4,
        max_output_tokens: 600,
      },
    });
  }

  return NextResponse.json({ profile: data });
}

export async function PUT(req: Request) {
  const rl = limit(getClientKey(req, 'ai-profile-put'), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const { error } = await sb.from('ai_profiles').upsert(
    {
      user_id: auth.user.id,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
