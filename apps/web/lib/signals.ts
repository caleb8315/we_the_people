import type { SupabaseClient } from '@supabase/supabase-js';

export interface SignalRowRaw {
  id: string;
  title: string;
  summary: string | null;
  url?: string | null;
  topic: string | null;
  country_code: string | null;
  severity: number;
  confidence: number;
  verification_status: 'verified' | 'developing' | 'unverified' | 'quarantined' | 'blocked';
  source_count: number;
  credible_source_count: number;
  distinct_domains: string[] | null;
  source_id?: string | null;
  occurred_at?: string | null;
  first_seen_at: string;
  raw_data?: Record<string, unknown> | null;
}

export interface DecoratedSignal extends SignalRowRaw {
  contradictions_count: number;
  is_disputed: boolean;
  is_new_since: boolean;
}

/**
 * Decorate raw signal rows with `contradictions_count`, `is_disputed`, and
 * `is_new_since` flags using a small, RLS-safe follow-up query.
 *
 * Safe to call as the authed user or service role; the `contradictions`
 * table is public-readable, so either works.
 */
export async function decorateSignals(
  sb: SupabaseClient,
  signals: SignalRowRaw[],
  opts: { newSince?: string | null } = {},
): Promise<DecoratedSignal[]> {
  if (!signals.length) return [];

  const ids = signals.map((s) => s.id);
  const { data: contradictionRows } = await sb
    .from('contradictions')
    .select('signal_id')
    .in('signal_id', ids);

  const counts = new Map<string, number>();
  for (const row of contradictionRows ?? []) {
    const key = String((row as { signal_id: string }).signal_id);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const newSinceTs = opts.newSince ? Date.parse(opts.newSince) : 0;

  return signals.map((s) => {
    const count = counts.get(s.id) ?? 0;
    return {
      ...s,
      contradictions_count: count,
      is_disputed: count > 0,
      is_new_since: newSinceTs > 0 && Date.parse(s.first_seen_at) > newSinceTs,
    };
  });
}

export interface PreferenceFilter {
  topics?: string[] | null;
  muted_sources?: string[] | null;
  muted_topics?: string[] | null;
  countries_of_focus?: string[] | null;
}

export function personalizeSignals<T extends SignalRowRaw>(signals: T[], prefs: PreferenceFilter | null): T[] {
  const focusTopics = new Set((prefs?.topics ?? []).map(String));
  const mutedTopics = new Set((prefs?.muted_topics ?? []).map(String));
  const mutedSources = new Set((prefs?.muted_sources ?? []).map(String));
  const countries = new Set((prefs?.countries_of_focus ?? []).map((c) => String(c).toUpperCase()));

  return signals
    .filter((s) => !s.source_id || !mutedSources.has(String(s.source_id)))
    .filter((s) => !mutedTopics.has(String(s.topic ?? 'other')))
    .filter((s) => (focusTopics.size === 0 ? true : focusTopics.has(String(s.topic ?? 'other'))))
    .filter((s) =>
      countries.size === 0 ? true : countries.has(String(s.country_code ?? '').toUpperCase()),
    );
}
