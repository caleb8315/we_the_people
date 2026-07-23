import { NextResponse } from 'next/server';
import { getAdminSupabase, getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/account/delete — removes the current user's auth row.
 * Remove user-owned rows before deleting the Auth identity. Some historical
 * verification tables intentionally use `on delete set null` so that
 * aggregate product metrics survive; explicit cleanup prevents retaining
 * personal submissions after a deletion request.
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'acct-delete'), 3, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = getAdminSupabase();
  const userId = auth.user.id;
  const cleanup = await Promise.all([
    admin.from('verification_cases').delete().eq('user_id', userId),
    admin.from('verifications').delete().eq('user_id', userId),
    admin.from('user_progress').delete().eq('user_id', userId),
    admin.from('user_daily_usage').delete().eq('user_id', userId),
  ]);
  const cleanupError = cleanup.find((result) => result.error)?.error;
  if (cleanupError) return NextResponse.json({ error: cleanupError.message }, { status: 500 });

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.auth.signOut();
  return NextResponse.json({ ok: true });
}
