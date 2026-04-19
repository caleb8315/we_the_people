import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/sources — used by the Settings UI for source toggles. */
export async function GET() {
  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from('sources')
    .select('id, name, kind, country_code, credibility, metadata')
    .eq('enabled', true)
    .order('credibility', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sources: data ?? [] });
}
