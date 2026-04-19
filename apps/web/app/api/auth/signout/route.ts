import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const sb = getServerSupabase();
  await sb.auth.signOut();
  return NextResponse.json({ ok: true });
}
