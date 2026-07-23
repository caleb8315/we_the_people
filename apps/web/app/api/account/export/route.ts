import { NextResponse } from 'next/server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/account/export
 * Self-serve JSON export for every row tied to the current user.
 */
export async function GET(req: Request) {
  const rl = limit(getClientKey(req, 'acct-export'), 3, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = auth.user.id;
  const [
    { data: profile },
    { data: preferences },
    { data: feedback },
    { data: notifications },
    { data: savedViews },
    { data: aiProfile },
    { data: aiSessions },
    { data: aiMessages },
    { data: verifications },
    { data: productEvents },
    { data: progress },
    { data: dailyUsage },
  ] = await Promise.all([
    sb.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('preferences').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('feedback').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    sb
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    sb.from('user_saved_views').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    sb.from('ai_profiles').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('ai_sessions').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    sb.from('ai_messages').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    sb.from('verifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    sb.from('product_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    sb.from('user_progress').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('user_daily_usage').select('*').eq('user_id', userId).order('day', { ascending: false }),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    schema_version: 1,
    account: {
      id: auth.user.id,
      email: auth.user.email ?? null,
      created_at: auth.user.created_at ?? null,
      last_sign_in_at: auth.user.last_sign_in_at ?? null,
      user_metadata: auth.user.user_metadata ?? {},
    },
    profile,
    preferences,
    feedback: feedback ?? [],
    notifications: notifications ?? [],
    saved_views: savedViews ?? [],
    ai_profile: aiProfile,
    ai_sessions: aiSessions ?? [],
    ai_messages: aiMessages ?? [],
    verifications: verifications ?? [],
    product_events: productEvents ?? [],
    progress,
    daily_usage: dailyUsage ?? [],
  };

  const filename = `crosscheck-account-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
