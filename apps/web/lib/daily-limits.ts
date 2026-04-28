import {
  consumeSharedUserDailyLimit,
  userDailyLimitsFromEnv,
  type UserLimitBucket,
} from '@osint/core/daily-limits';
import type { SupabaseClient } from '@supabase/supabase-js';

export type { UserLimitBucket } from '@osint/core/daily-limits';

export const USER_DAILY_LIMITS = userDailyLimitsFromEnv(process.env);

export async function consumeUserDailyLimit(
  sb: SupabaseClient,
  userId: string,
  bucket: UserLimitBucket,
): Promise<{ ok: boolean; used: number; limit: number }> {
  return consumeSharedUserDailyLimit(sb, USER_DAILY_LIMITS, userId, bucket);
}
