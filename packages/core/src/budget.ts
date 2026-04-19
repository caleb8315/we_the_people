/**
 * LLM budget guard. All buckets share a global ceiling and each bucket has
 * its own daily cap. The goal is to keep the platform $0/day on free tiers
 * even under beta load.
 *
 * Usage:
 *   const ok = await tryConsume(sb, 'signals');   // returns boolean
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type Bucket = 'signals' | 'briefing' | 'contradiction';

export interface BudgetConfig {
  global: number;
  perBucket: Record<Bucket, number>;
}

export function readBudgetConfig(env: NodeJS.ProcessEnv = process.env): BudgetConfig {
  const num = (k: string, d: number) => {
    const v = env[k];
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : d;
  };
  return {
    global: num('MAX_DAILY_LLM_CALLS', 200),
    perBucket: {
      signals: num('MAX_DAILY_LLM_CALLS_SIGNALS', 150),
      briefing: num('MAX_DAILY_LLM_CALLS_BRIEFING', 20),
      contradiction: num('MAX_DAILY_LLM_CALLS_CONTRADICTION', 30),
    },
  };
}

export async function tryConsume(
  sb: SupabaseClient,
  bucket: Bucket,
  cfg: BudgetConfig = readBudgetConfig(),
): Promise<{ ok: boolean; reason?: string; used: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await sb
    .from('usage_ledger')
    .select('bucket, calls')
    .eq('day', today);

  if (error) {
    // Fail closed: if we cannot verify budget, skip LLM work.
    return { ok: false, reason: `ledger error: ${error.message}`, used: 0 };
  }

  let total = 0;
  let used = 0;
  for (const row of data ?? []) {
    total += row.calls;
    if (row.bucket === bucket) used += row.calls;
  }

  if (total >= cfg.global) return { ok: false, reason: 'global cap reached', used };
  if (used >= cfg.perBucket[bucket]) return { ok: false, reason: `${bucket} cap reached`, used };

  const { error: insErr } = await sb
    .from('usage_ledger')
    .insert({ day: today, bucket, calls: 1 });

  if (insErr) return { ok: false, reason: `ledger insert: ${insErr.message}`, used };

  return { ok: true, used: used + 1 };
}
