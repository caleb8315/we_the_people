/**
 * Tracked-events source — our own clustered signals database.
 *
 * This is the exact same matching logic that lived inside
 * `verify-corroboration.ts` before the Phase 7 rewrite, lifted out and
 * reshaped to the `SourceSearcher` contract so it participates in the
 * parallel fan-out like every other system.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { type DetectedContradiction, type EvidenceItem, type PhysicalEvidence } from '@osint/core';
import type { SourceQuery, SourceResult } from './types';

export interface MatchedSignal {
  id: string;
  title: string;
  topic: string | null;
  country_code: string | null;
  source_count: number;
  credible_source_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface TrackedEventsResult extends SourceResult {
  /** Full matched-signal summary for the UI banner + link. */
  matched_signal: MatchedSignal | null;
  matched_by: 'url' | 'keyword' | null;
  /** Any contradictions already logged on that signal. */
  contradictions: DetectedContradiction[];
  physical_evidence: PhysicalEvidence | null;
  complex_signal: boolean;
}

export async function searchTrackedEvents(
  sb: SupabaseClient,
  q: SourceQuery,
): Promise<TrackedEventsResult> {
  const empty: TrackedEventsResult = {
    id: 'tracked_events',
    name: 'Tracked events',
    status: 'miss',
    hits: 0,
    note: 'No match in our clustered-events database.',
    evidence: [],
    matched_signal: null,
    matched_by: null,
    contradictions: [],
    physical_evidence: null,
    complex_signal: false,
  };

  const match = await findMatchingSignal(sb, q);
  if (!match.row) return empty;

  const [{ data: evidence }, { data: contradictions }] = await Promise.all([
    sb
      .from('evidence')
      .select('source_id,url,domain,title,published_at,is_credible,excerpt')
      .eq('signal_id', match.row.id)
      .order('published_at', { ascending: false }),
    sb
      .from('contradictions')
      .select('type,severity,summary,metadata,evidence_ids')
      .eq('signal_id', match.row.id),
  ]);

  const evItems: EvidenceItem[] = (evidence ?? []).map((e) => {
    const row = e as EvidenceRow;
    return {
      source_id: row.source_id ?? null,
      url: row.url ?? '',
      domain: row.domain ?? '',
      title: row.title ?? null,
      published_at: row.published_at ?? null,
      is_credible: Boolean(row.is_credible),
      excerpt: row.excerpt ?? null,
    };
  });

  const cItems: DetectedContradiction[] = (contradictions ?? []).map((c) => {
    const row = c as ContradictionRow;
    return {
      type: (row.type ?? 'cause_conflict') as DetectedContradiction['type'],
      severity: (row.severity ?? 'medium') as DetectedContradiction['severity'],
      summary: row.summary ?? '',
      metadata: (row.metadata ?? {}) as DetectedContradiction['metadata'],
      evidence_ids: Array.isArray(row.evidence_ids) ? row.evidence_ids : [],
    };
  });

  const pe = readPhysicalEvidence(match.row.raw_data);
  const complex =
    Array.isArray(match.row.tags) && (match.row.tags as string[]).includes('complex_signal');

  return {
    id: 'tracked_events',
    name: 'Tracked events',
    status: 'hit',
    hits: evItems.length,
    note: `Matched signal "${match.row.title}" (${match.matched_by === 'url' ? 'URL' : 'headline'} match) with ${evItems.length} evidence rows.`,
    evidence: evItems,
    matched_signal: {
      id: match.row.id,
      title: match.row.title,
      topic: match.row.topic ?? null,
      country_code: match.row.country_code ?? null,
      source_count: match.row.source_count ?? 0,
      credible_source_count: match.row.credible_source_count ?? 0,
      first_seen_at: match.row.first_seen_at ?? null,
      last_seen_at: match.row.last_seen_at ?? null,
    },
    matched_by: match.matched_by,
    contradictions: cItems,
    physical_evidence: pe,
    complex_signal: complex,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function findMatchingSignal(
  sb: SupabaseClient,
  q: SourceQuery,
): Promise<{ row: SignalRow | null; matched_by: 'url' | 'keyword' | null }> {
  if (q.canonicalUrl) {
    const { data: evRow } = await sb
      .from('evidence')
      .select('signal_id')
      .eq('url', q.canonicalUrl)
      .limit(1)
      .maybeSingle();
    if (evRow?.signal_id) {
      const { data: signal } = await sb
        .from('signals_public')
        .select('*')
        .eq('id', evRow.signal_id)
        .maybeSingle();
      if (signal) return { row: signal as SignalRow, matched_by: 'url' };
    }
  }

  if (q.keywords.length < 3) return { row: null, matched_by: null };

  const sinceIso = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const top = q.keywords.slice(0, 7);
  const orFilter = top
    .flatMap((k) => [
      `title.ilike.%${escapeIlike(k)}%`,
      `summary.ilike.%${escapeIlike(k)}%`,
    ])
    .join(',');

  const { data: candidates } = await sb
    .from('signals_public')
    .select('*')
    .gt('last_seen_at', sinceIso)
    .or(orFilter)
    .order('last_seen_at', { ascending: false })
    .limit(50);

  if (!candidates || candidates.length === 0) return { row: null, matched_by: null };

  const scored = candidates
    .map((c: SignalRow) => {
      const haystack = `${c.title ?? ''} ${c.summary ?? ''}`.toLowerCase();
      return {
        row: c,
        score: scoreOverlap(haystack, q.keywords),
        ratio: scoreOverlap(haystack, q.keywords) / q.keywords.length,
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < MIN_KEYWORD_HITS || best.ratio < MIN_KEYWORD_RATIO) {
    return { row: null, matched_by: null };
  }
  return { row: best.row, matched_by: 'keyword' };
}

const MIN_KEYWORD_HITS = 3;
const MIN_KEYWORD_RATIO = 0.4;

function readPhysicalEvidence(raw: Record<string, unknown> | null): PhysicalEvidence | null {
  if (!raw) return null;
  const pe = raw.physical_evidence;
  if (!pe || typeof pe !== 'object') return null;
  const cand = pe as Record<string, unknown>;
  if (typeof cand.status !== 'string') return null;
  return pe as PhysicalEvidence;
}

function scoreOverlap(haystack: string, needles: string[]): number {
  const words = new Set(haystack.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/));
  let score = 0;
  for (const n of needles) {
    if (words.has(n)) score += 1;
  }
  return score;
}

function escapeIlike(s: string): string {
  return s.replace(/[%_]/g, '\\$&');
}

type SignalRow = {
  id: string;
  title: string;
  summary: string | null;
  url: string | null;
  topic: string | null;
  country_code: string | null;
  verification_status: string;
  source_count: number | null;
  credible_source_count: number | null;
  tags: string[] | null;
  occurred_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  reliability_score: number | null;
  reliability_label: string | null;
  raw_data: Record<string, unknown> | null;
};

type EvidenceRow = {
  source_id: string | null;
  url: string | null;
  domain: string | null;
  title: string | null;
  published_at: string | null;
  is_credible: boolean | null;
  excerpt: string | null;
};

type ContradictionRow = {
  type: string | null;
  severity: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  evidence_ids: string[] | null;
};
