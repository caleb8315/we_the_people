import type { SupabaseClient } from '@supabase/supabase-js';

export type UserLimitBucket = 'ai_chat' | 'priority_alert' | 'daily_briefing' | 'briefing_call';

export const USER_DAILY_LIMITS: Record<UserLimitBucket, number> = {
  ai_chat: Number(process.env.USER_DAILY_CHAT_LIMIT ?? 10),
  priority_alert: Number(process.env.USER_DAILY_PRIORITY_ALERT_LIMIT ?? 5),
  daily_briefing: Number(process.env.USER_DAILY_BRIEFING_EMAIL_LIMIT ?? 1),
  briefing_call: Number(process.env.USER_DAILY_BRIEFING_CALL_LIMIT ?? 2),
};

export function userDailyLimitsFromEnv(
  input: Record<string, string | undefined>,
): Record<UserLimitBucket, number> {
  return {
    ai_chat: Number(input.USER_DAILY_CHAT_LIMIT ?? 10),
    priority_alert: Number(input.USER_DAILY_PRIORITY_ALERT_LIMIT ?? 5),
    daily_briefing: Number(input.USER_DAILY_BRIEFING_EMAIL_LIMIT ?? 1),
    briefing_call: Number(input.USER_DAILY_BRIEFING_CALL_LIMIT ?? 2),
  };
}

/**
 * Consume one unit from a per-user per-day usage bucket.
 *
 * `userCap` lets a user preference further tighten the platform default
 * without duplicating the read/write logic in each runtime.
 */
export async function consumeUserDailyLimit(
  sb: SupabaseClient,
  userId: string,
  bucket: UserLimitBucket,
  userCap?: number,
): Promise<{ ok: boolean; used: number; limit: number }> {
  return consumeSharedUserDailyLimit(sb, USER_DAILY_LIMITS, userId, bucket, userCap);
}

export async function consumeSharedUserDailyLimit(
  sb: SupabaseClient,
  limits: Record<UserLimitBucket, number>,
  userId: string,
  bucket: UserLimitBucket,
  userCap?: number,
): Promise<{ ok: boolean; used: number; limit: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const platformLimit = limits[bucket];
  const effectiveLimit = userCap != null ? Math.min(userCap, platformLimit) : platformLimit;

  const { data, error } = await sb
    .from('user_daily_usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('day', day)
    .eq('bucket', bucket);

  if (error) return { ok: false, used: 0, limit: effectiveLimit };

  const used = (data ?? []).reduce((sum, row) => sum + Number(row.calls ?? 0), 0);
  if (used >= effectiveLimit) return { ok: false, used, limit: effectiveLimit };

  const { error: insertError } = await sb.from('user_daily_usage').insert({
    user_id: userId,
    day,
    bucket,
    calls: 1,
  });
  if (insertError) return { ok: false, used, limit: effectiveLimit };

  return { ok: true, used: used + 1, limit: effectiveLimit };
}
