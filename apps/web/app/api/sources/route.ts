import { NextResponse } from 'next/server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/sources — used by the Settings UI for source toggles. */
export async function GET(req: Request) {
  const rl = limit(getClientKey(req, 'sources'), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('sources')
    .select('id, name, kind, country_code, credibility, metadata')
    .eq('enabled', true)
    .order('credibility', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sources: data ?? [] });
}
