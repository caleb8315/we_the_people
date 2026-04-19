import { NextResponse } from 'next/server';
import { getAdminSupabase, getServerSupabase } from '@/lib/supabase-server';
import { isAdminEmail } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/admin/requests — list access requests (admin only). */
export async function GET() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdminEmail(auth.user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('access_requests')
    .select('*')
    .order('status', { ascending: true })
    .order('requested_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}
