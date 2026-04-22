/**
 * Live-corroboration orchestrator (Phase 7).
 *
 * Fan out to every independent verification system in parallel, aggregate
 * every EvidenceItem they return, dedupe by URL, and hand one merged
 * corpus back to the caller. This is what turns "1 credible outlet" into
 * a real multi-system verification.
 *
 * Every subsystem implements the `SourceSearcher` contract and is
 * bounded by its own per-call timeout. The orchestrator additionally
 * enforces a global timeout so a single slow provider can never block
 * the user's response beyond the overall budget.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DetectedContradiction, EvidenceItem, PhysicalEvidence } from '@osint/core';

import { SOURCE_NAMES, type SourceId, type SourceQuery, type SourceResult } from './types';
import { searchWeb } from './web';
import { searchReddit, searchBluesky } from './social';
import { searchWikipedia, searchGdelt } from './reference';
import { searchSensors } from './sensors';
import { searchTrackedEvents, type MatchedSignal, type TrackedEventsResult } from './tracked-events';

/** Global upper bound for the full fan-out. Each searcher has its own
 *  shorter timeout; this is the seatbelt in case something goes sideways.
 *  GDELT's free API often takes 20-30s. We honour that rather than
 *  short-circuiting to a cheap "error" — the client shows progressive
 *  loading messages so the wait feels intentional. The remaining jobs
 *  all complete in <6s in parallel, so the *actual* verify latency is
 *  whatever GDELT decides on its end (plus ~200ms of our processing). */
const GLOBAL_TIMEOUT_MS = 35_000;

export interface LiveCorroborationResult {
  /** Per-system coverage: what we searched, what each returned. */
  systems: Array<Omit<SourceResult, 'evidence' | 'physical_evidence'> & { evidence_count: number }>;
  /** Fully-deduped evidence from every system combined. */
  merged_evidence: EvidenceItem[];
  /** Contradictions from the matched signal (if any). */
  contradictions: DetectedContradiction[];
  /** Highest-strength physical_evidence across tracked-events + sensors. */
  physical_evidence: PhysicalEvidence | null;
  /** Flag lifted from the matched signal's tags, if any. */
  complex_signal: boolean;
  /** Signal summary for UI banner + "See full event" link. */
  matched_signal: MatchedSignal | null;
  matched_by: 'url' | 'keyword' | null;
}

export async function runLiveCorroboration(
  sb: SupabaseClient,
  q: SourceQuery,
): Promise<LiveCorroborationResult> {
  // All searchers fire together. We use `withTimeout` to bound the caller
  // even if one upstream hangs. Each job is tagged with its SourceId so the
  // timeout fallback can produce a correctly-labeled result — without this,
  // a timed-out GDELT job would masquerade as a "web" row in the coverage
  // strip. Tracked events runs separately because its result shape carries
  // extra metadata (matched signal, contradictions, physical_evidence) that
  // doesn't fit the plain SourceResult contract.
  const jobs: Array<[SourceId, Promise<SourceResult>]> = [
    ['web', searchWeb(q)],
    ['reddit', searchReddit(q)],
    ['bluesky', searchBluesky(q)],
    ['wikipedia', searchWikipedia(q)],
    ['gdelt', searchGdelt(q)],
    ['sensors', searchSensors(q)],
  ];
  const trackedPromise: Promise<TrackedEventsResult> = searchTrackedEvents(sb, q);

  const [trackedSettled, ...rest] = await Promise.all([
    withTimeout(trackedPromise, GLOBAL_TIMEOUT_MS, fallbackTrackedEvents()),
    ...jobs.map(([id, p]) => withTimeout(p, GLOBAL_TIMEOUT_MS, timeoutResult(id))),
  ]);
  const tracked = trackedSettled as TrackedEventsResult;
  const sourceResults = rest as SourceResult[];

  // Compose per-system rows. Tracked events first so it reads
  // left-to-right from "our own data" → "live web + social".
  const systems: LiveCorroborationResult['systems'] = [
    stripHeavy(tracked),
    ...sourceResults.map(stripHeavy),
  ];

  const mergedEvidence = dedupeByUrl([
    ...tracked.evidence,
    ...sourceResults.flatMap((r) => r.evidence),
  ]);

  // Prefer tracked-events physical_evidence if it has a `confirmed` status;
  // otherwise fall back to the sensors searcher's own physical_evidence.
  const sensorsRow = sourceResults.find((r) => r.id === 'sensors');
  const physical = pickStrongerPhysical(
    tracked.physical_evidence,
    sensorsRow?.physical_evidence ?? null,
  );

  return {
    systems,
    merged_evidence: mergedEvidence,
    contradictions: tracked.contradictions,
    physical_evidence: physical,
    complex_signal: tracked.complex_signal,
    matched_signal: tracked.matched_signal,
    matched_by: tracked.matched_by,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Drop the heavy fields (`evidence`, `physical_evidence`) from per-system
 * rows before sending to the client. We only need the count for the UI
 * coverage strip; the full evidence is already merged separately.
 */
function stripHeavy(
  r: SourceResult | TrackedEventsResult,
): Omit<SourceResult, 'evidence' | 'physical_evidence'> & { evidence_count: number } {
  return {
    id: r.id,
    name: r.name ?? SOURCE_NAMES[r.id as SourceId] ?? r.id,
    status: r.status,
    hits: r.hits,
    note: r.note,
    evidence_count: r.evidence.length,
  };
}

function dedupeByUrl(items: EvidenceItem[]): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  const seen = new Set<string>();
  for (const e of items) {
    const key = (e.url ?? '').toLowerCase().trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function pickStrongerPhysical(
  a: PhysicalEvidence | null,
  b: PhysicalEvidence | null,
): PhysicalEvidence | null {
  const rank: Record<string, number> = {
    confirmed: 3,
    partial: 2,
    none_detected: 1,
    insufficient: 0,
  };
  const sa = a ? rank[a.status] ?? -1 : -1;
  const sb = b ? rank[b.status] ?? -1 : -1;
  if (sa < 0 && sb < 0) return null;
  return sa >= sb ? a : b;
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([
      p.then((v) => {
        clearTimeout(timer);
        return v;
      }),
      timeout,
    ]);
  } catch {
    return fallback;
  }
}

function timeoutResult(id: SourceId): SourceResult {
  return {
    id,
    name: SOURCE_NAMES[id] ?? id,
    status: 'skipped',
    hits: 0,
    note: `No response within ${GLOBAL_TIMEOUT_MS / 1000}s global verify budget.`,
    evidence: [],
  };
}

function fallbackTrackedEvents(): TrackedEventsResult {
  return {
    id: 'tracked_events',
    name: 'Tracked events',
    status: 'error',
    hits: 0,
    note: 'Database query timed out.',
    evidence: [],
    matched_signal: null,
    matched_by: null,
    contradictions: [],
    physical_evidence: null,
    complex_signal: false,
  };
}

export type { MatchedSignal, SourceId };
