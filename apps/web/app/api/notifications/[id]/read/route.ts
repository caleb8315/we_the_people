import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { sanitizeNextPath } from '@/lib/safe-redirect';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const rl = limit(getClientKey(req, 'notification-read-post'), 40, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await sb
    .from('user_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = new URL(req.url);
  const next = sanitizeNextPath(url.searchParams.get('next'), '/notifications');
  return NextResponse.redirect(new URL(next, url.origin), 303);
}
