import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildConfidenceReport,
  type ConfidenceReport,
  type EvidenceItem,
  type PhysicalEvidence,
  type VerificationStatus,
} from '@osint/core';
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

export interface CommunityFeedback {
  helpful: number;
  unclear: number;
  inaccurate: number;
  total: number;
}

export interface DecoratedSignal extends SignalRowRaw {
  contradictions_count: number;
  is_disputed: boolean;
  is_new_since: boolean;
  contradictions_inline: ContradictionInline[];
  physical_evidence: PhysicalEvidence | null;
  has_usgs_confirmation: boolean;
  has_satellite_confirmation: boolean;
  confidence_report: ConfidenceReport;
  community_feedback: CommunityFeedback;
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
 *
 * Phase 0: we also fetch the top `TRACE_EVIDENCE_PER_SIGNAL` evidence rows
 * per signal so `buildConfidenceReport` can produce a real `source_trace`
 * without the caller having to run a second query. When the feed renders
 * many signals we keep the fetch bounded — the detail page always has the
 * full evidence list available via its own query.
 */
export async function decorateSignals(
  sb: SupabaseClient,
  signals: SignalRowRaw[],
  opts: { newSince?: string | null } = {},
): Promise<DecoratedSignal[]> {
  if (!signals.length) return [];

  const ids = signals.map((s) => s.id);
  const [{ data: contradictionRows }, { data: evidenceRows }, { data: feedbackRows }] = await Promise.all([
    sb
      .from('contradictions')
      .select('signal_id, type, severity, summary, metadata, evidence_ids, created_at')
      .in('signal_id', ids)
      .order('created_at', { ascending: true }),
    sb
      .from('evidence')
      .select('signal_id, source_id, url, domain, title, published_at, is_credible, excerpt')
      .in('signal_id', ids)
      .order('published_at', { ascending: false }),
    sb
      .from('feedback')
      .select('signal_id, kind')
      .in('signal_id', ids),
  ]);

  const counts = new Map<string, number>();
  const inline = new Map<string, ContradictionInline[]>();
  const contradictionsBySignal = new Map<
    string,
    Array<{
      type: string | null;
      severity: string | null;
      summary: string | null;
      metadata: Record<string, unknown> | null;
      evidence_ids: string[];
    }>
  >();
  for (const row of contradictionRows ?? []) {
    const r = row as {
      signal_id: string;
      type: string | null;
      severity: string | null;
      summary: string | null;
      metadata: Record<string, unknown> | null;
      evidence_ids: string[] | null;
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
    const full = contradictionsBySignal.get(r.signal_id) ?? [];
    full.push({
      type: r.type,
      severity: r.severity,
      summary: r.summary,
      metadata: r.metadata,
      evidence_ids: Array.isArray(r.evidence_ids) ? r.evidence_ids : [],
    });
    contradictionsBySignal.set(r.signal_id, full);
  }

  const evidenceBySignal = new Map<string, EvidenceItem[]>();
  for (const row of evidenceRows ?? []) {
    const r = row as {
      signal_id: string;
      source_id: string | null;
      url: string;
      domain: string;
      title: string | null;
      published_at: string | null;
      is_credible: boolean | null;
      excerpt: string | null;
    };
    const bucket = evidenceBySignal.get(r.signal_id) ?? [];
    if (bucket.length < TRACE_EVIDENCE_PER_SIGNAL) {
      bucket.push({
        source_id: r.source_id,
        url: r.url,
        domain: r.domain,
        title: r.title,
        published_at: r.published_at,
        is_credible: Boolean(r.is_credible),
        excerpt: r.excerpt,
      });
      evidenceBySignal.set(r.signal_id, bucket);
    }
  }

  const feedbackBySignal = new Map<string, CommunityFeedback>();
  for (const row of feedbackRows ?? []) {
    const r = row as { signal_id: string; kind: string };
    if (!r.signal_id) continue;
    const fb = feedbackBySignal.get(r.signal_id) ?? { helpful: 0, unclear: 0, inaccurate: 0, total: 0 };
    if (r.kind === 'useful') fb.helpful++;
    else if (r.kind === 'helpful_context') fb.unclear++;
    else if (r.kind === 'wrong') fb.inaccurate++;
    fb.total++;
    feedbackBySignal.set(r.signal_id, fb);
  }

  const newSinceTs = opts.newSince ? Date.parse(opts.newSince) : 0;

  return signals.map((s) => {
    const count = counts.get(s.id) ?? 0;
    const physical_evidence = readPhysicalEvidence(s.raw_data ?? null);
    const contradictionsForReport = (contradictionsBySignal.get(s.id) ?? []).map((c) => ({
      type: (c.type ?? 'cause_conflict') as
        | 'cause_conflict'
        | 'numeric_conflict'
        | 'presence_conflict',
      severity: (c.severity ?? 'medium') as 'low' | 'medium' | 'high',
      summary: c.summary ?? '',
      metadata: c.metadata ?? {},
      evidence_ids: c.evidence_ids ?? [],
    }));
    const isComplex = Array.isArray(s.tags) && s.tags.includes('complex_signal');
    const confidence_report = buildConfidenceReport({
      verification_status: s.verification_status as VerificationStatus,
      reliability_score: s.reliability_score ?? null,
      reliability_label: (s.reliability_label as
        | 'LIKELY_ACCURATE'
        | 'UNCLEAR'
        | 'LIKELY_UNRELIABLE'
        | null) ?? null,
      evidence: evidenceBySignal.get(s.id) ?? [],
      contradictions: contradictionsForReport,
      physical_evidence,
      source_count: s.source_count ?? 0,
      credible_source_count: s.credible_source_count ?? 0,
      complex_signal: isComplex,
    });
    return {
      ...s,
      contradictions_count: count,
      contradictions_inline: inline.get(s.id) ?? [],
      is_disputed: count > 0,
      is_new_since: newSinceTs > 0 && Date.parse(s.first_seen_at) > newSinceTs,
      physical_evidence,
      has_usgs_confirmation: readBoolFlag(s.raw_data ?? null, 'usgs_match'),
      has_satellite_confirmation: readBoolFlag(s.raw_data ?? null, 'eonet_match'),
      confidence_report,
      community_feedback: feedbackBySignal.get(s.id) ?? { helpful: 0, unclear: 0, inaccurate: 0, total: 0 },
    };
  });
}

const TRACE_EVIDENCE_PER_SIGNAL = 8;

export interface PreferenceFilter {
  topics?: string[] | null;
  muted_sources?: string[] | null;
  muted_topics?: string[] | null;
  countries_of_focus?: string[] | null;
}

/**
 * Apply user preferences to filter signals. Used in personalized mode
 * to narrow by focus topics and countries.
 */
export function personalizeSignals<T extends SignalRowRaw>(signals: T[], prefs: PreferenceFilter | null): T[] {
  const mutedTopics = new Set((prefs?.muted_topics ?? []).map(String));
  const mutedSources = new Set((prefs?.muted_sources ?? []).map(String));
  const focusTopics = new Set((prefs?.topics ?? []).map(String));
  const countries = new Set((prefs?.countries_of_focus ?? []).map((c) => String(c).toUpperCase()));

  return signals
    .filter((s) => !s.source_id || !mutedSources.has(String(s.source_id)))
    .filter((s) => !mutedTopics.has(String(s.topic ?? 'other')))
    .filter((s) => (focusTopics.size === 0 ? true : focusTopics.has(String(s.topic ?? 'other'))))
    .filter((s) =>
      countries.size === 0 ? true : countries.has(String(s.country_code ?? '').toUpperCase()),
    );
}

/**
 * Apply mutes regardless of feed mode. Muted topics and sources should
 * ALWAYS be hidden — even in global mode. Users muting something means
 * they don't want to see it, period.
 */
export function applyMutes<T extends SignalRowRaw>(signals: T[], prefs: PreferenceFilter | null): T[] {
  if (!prefs) return signals;
  const mutedTopics = new Set((prefs.muted_topics ?? []).map(String));
  const mutedSources = new Set((prefs.muted_sources ?? []).map(String));

  return signals
    .filter((s) => !s.source_id || !mutedSources.has(String(s.source_id)))
    .filter((s) => !mutedTopics.has(String(s.topic ?? 'other')));
}
