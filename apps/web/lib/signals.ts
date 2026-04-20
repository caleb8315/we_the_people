import type { SupabaseClient } from '@supabase/supabase-js';
import type { PhysicalEvidence } from '@osint/core';
import type { ContradictionInline } from './contradictions-display';

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
  tags?: string[] | null;
  source_id?: string | null;
  occurred_at?: string | null;
  first_seen_at: string;
  raw_data?: Record<string, unknown> | null;
  // Phase-2 reliability dimensions (migration 015). Nullable because
  // rows ingested before the migration ran will not have them populated.
  reliability_score?: number | null;
  agreement_score?: number | null;
  source_independence_score?: number | null;
  narrative_divergence_score?: number | null;
  evidence_strength_score?: number | null;
  // Phase-3 user-facing label contract (migration 016).
  reliability_label?: 'LIKELY_ACCURATE' | 'UNCLEAR' | 'LIKELY_UNRELIABLE' | null;
  reliability_summary?: string | null;
}

export interface DecoratedSignal extends SignalRowRaw {
  contradictions_count: number;
  is_disputed: boolean;
  is_new_since: boolean;
  /**
   * At most 3 of this signal's contradictions, in original order, ready to
   * render as one-line bullets inside the signal card without a follow-up
   * fetch.
   */
  contradictions_inline: ContradictionInline[];
  /**
   * Phase-5 structured physical evidence (status / confidence / sources /
   * limitations). Lifted from `raw_data.physical_evidence`. `null` for
   * signals ingested before Phase 5 ran.
   */
  physical_evidence: PhysicalEvidence | null;
  /**
   * Phase-4 back-compat booleans, derived from
   * `raw_data.reliability.{usgs_match,eonet_match}`. Kept for cards that
   * render before Phase 5 has backfilled `physical_evidence`.
   */
  has_usgs_confirmation: boolean;
  has_satellite_confirmation: boolean;
}

const INLINE_CONTRADICTIONS_PER_SIGNAL = 3;

function readBoolFlag(raw: Record<string, unknown> | null | undefined, key: string): boolean {
  if (!raw) return false;
  const rel = raw.reliability;
  if (rel && typeof rel === 'object' && rel !== null) {
    const v = (rel as Record<string, unknown>)[key];
    if (typeof v === 'boolean') return v;
  }
  return false;
}

function readPhysicalEvidence(
  raw: Record<string, unknown> | null | undefined,
): PhysicalEvidence | null {
  const pe = raw?.physical_evidence;
  if (!pe || typeof pe !== 'object') return null;
  const candidate = pe as Record<string, unknown>;
  const status = candidate.status;
  if (status !== 'confirmed' && status !== 'partial' && status !== 'none_detected') {
    return null;
  }
  const confidence = typeof candidate.confidence === 'number' ? candidate.confidence : 0;
  const sources = Array.isArray(candidate.sources)
    ? (candidate.sources.filter((s) => typeof s === 'string') as string[])
    : [];
  const limitations = Array.isArray(candidate.limitations)
    ? (candidate.limitations.filter((s) => typeof s === 'string') as string[])
    : [];
  return { status, confidence, sources, limitations };
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
  // Phase 4 — the signal card needs contradictions visible without a click,
  // so we fetch the full contract columns (type / severity / summary /
  // metadata) up front and carry a trimmed inline array per signal.
  const { data: contradictionRows } = await sb
    .from('contradictions')
    .select('signal_id, type, severity, summary, metadata, created_at')
    .in('signal_id', ids)
    .order('created_at', { ascending: true });

  const counts = new Map<string, number>();
  const inline = new Map<string, ContradictionInline[]>();
  for (const row of contradictionRows ?? []) {
    const r = row as {
      signal_id: string;
      type: string | null;
      severity: string | null;
      summary: string | null;
      metadata: Record<string, unknown> | null;
    };
    counts.set(r.signal_id, (counts.get(r.signal_id) ?? 0) + 1);
    const bucket = inline.get(r.signal_id) ?? [];
    if (bucket.length < INLINE_CONTRADICTIONS_PER_SIGNAL) {
      bucket.push({
        type: r.type,
        severity: r.severity,
        summary: r.summary,
        metadata: r.metadata,
      });
      inline.set(r.signal_id, bucket);
    }
  }

  const newSinceTs = opts.newSince ? Date.parse(opts.newSince) : 0;

  return signals.map((s) => {
    const count = counts.get(s.id) ?? 0;
    return {
      ...s,
      contradictions_count: count,
      contradictions_inline: inline.get(s.id) ?? [],
      is_disputed: count > 0,
      is_new_since: newSinceTs > 0 && Date.parse(s.first_seen_at) > newSinceTs,
      physical_evidence: readPhysicalEvidence(s.raw_data ?? null),
      has_usgs_confirmation: readBoolFlag(s.raw_data ?? null, 'usgs_match'),
      has_satellite_confirmation: readBoolFlag(s.raw_data ?? null, 'eonet_match'),
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
