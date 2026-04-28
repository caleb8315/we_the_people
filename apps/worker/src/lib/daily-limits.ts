import type { SupabaseClient } from '@supabase/supabase-js';
import { USER_DAILY_LIMITS, type UserLimitBucket } from '@osint/core/daily-limits';

/**
 * @param userCap Optional per-user preference cap that overrides the
 *                platform default when lower. For priority_alert this
 *                comes from `max_alerts_per_day_preference`.
 */
export async function consumeUserDailyLimit(
  sb: SupabaseClient,
  userId: string,
  bucket: UserLimitBucket,
  userCap?: number,
): Promise<{ ok: boolean; used: number; limit: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const platformLimit = USER_DAILY_LIMITS[bucket];
  const effectiveLimit = userCap != null ? Math.min(userCap, platformLimit) : platformLimit;

  const { data, error } = await sb
    .from('user_daily_usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('day', day)
    .eq('bucket', bucket);
  if (error) return { ok: false, used: 0, limit: effectiveLimit };

  const used = (data ?? []).reduce((sum, r) => sum + Number(r.calls ?? 0), 0);
  if (used >= effectiveLimit) return { ok: false, used, limit: effectiveLimit };

  const { error: insErr } = await sb.from('user_daily_usage').insert({
    user_id: userId,
    day,
    bucket,
    calls: 1,
  });
  if (insErr) return { ok: false, used, limit: effectiveLimit };

  return { ok: true, used: used + 1, limit: effectiveLimit };
}
