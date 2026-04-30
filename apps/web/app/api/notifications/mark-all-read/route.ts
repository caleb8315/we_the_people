import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/notifications/mark-all-read
 * Marks all unread notifications for the current user as read.
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'notifications-mark-all-read'), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const now = new Date().toISOString();
  const { error } = await sb
    .from('user_notifications')
    .update({ is_read: true, read_at: now })
    .eq('user_id', auth.user.id)
    .eq('is_read', false);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.redirect(new URL('/notifications', req.url), { status: 303 });
}
