import type { SupabaseClient } from '@supabase/supabase-js';

export type UserLimitBucket = 'ai_chat' | 'priority_alert' | 'daily_briefing' | 'briefing_call';

const LIMITS: Record<UserLimitBucket, number> = {
  ai_chat: Number(process.env.USER_DAILY_CHAT_LIMIT ?? 10),
  priority_alert: Number(process.env.USER_DAILY_PRIORITY_ALERT_LIMIT ?? 5),
  daily_briefing: Number(process.env.USER_DAILY_BRIEFING_EMAIL_LIMIT ?? 1),
  briefing_call: Number(process.env.USER_DAILY_BRIEFING_CALL_LIMIT ?? 2),
};

export async function consumeUserDailyLimit(
  sb: SupabaseClient,
  userId: string,
  bucket: UserLimitBucket,
): Promise<{ ok: boolean; used: number; limit: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const limit = LIMITS[bucket];

  const { data, error } = await sb
    .from('user_daily_usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('day', day)
    .eq('bucket', bucket);
  if (error) return { ok: false, used: 0, limit };

  const used = (data ?? []).reduce((sum, r) => sum + Number(r.calls ?? 0), 0);
  if (used >= limit) return { ok: false, used, limit };

  const { error: insErr } = await sb.from('user_daily_usage').insert({
    user_id: userId,
    day,
    bucket,
    calls: 1,
  });
  if (insErr) return { ok: false, used, limit };

  return { ok: true, used: used + 1, limit };
}
