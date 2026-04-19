import { NextResponse } from 'next/server';
import { getAdminSupabase, getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/account/delete — removes the current user's auth row.
 * Cascaded deletes in Postgres remove their profile, preferences, and feedback.
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'acct-delete'), 3, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = getAdminSupabase();
  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.auth.signOut();
  return NextResponse.json({ ok: true });
}
