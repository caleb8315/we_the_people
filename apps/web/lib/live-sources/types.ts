/**
 * Live-corroboration source contract (Phase 7 — in-place rebuild).
 *
 * Every independent verification system — web search, Reddit, Bluesky,
 * Wikipedia, GDELT, open sensor networks, our own tracked events — implements
 * the same `SourceSearcher` signature. The orchestrator then fans out to all
 * of them in parallel and folds every returned EvidenceItem into the ONE
 * confidence engine that powers the feed and the verify page.
 *
 * Non-negotiable build rules:
 *   - No source is allowed to claim "verified" — sources supply evidence,
 *     the core engine decides the band.
 *   - Every searcher bounds itself with its own timeout and NEVER throws.
 *   - Every searcher returns a status so the UI can honestly tell the user
 *     which systems produced hits, missed, or weren't configured.
 */

import type { EvidenceItem, PhysicalEvidence } from '@osint/core';

/** Stable identifiers used in telemetry, logs, and the UI coverage strip. */
export type SourceId =
  | 'tracked_events'
  | 'web'
  | 'reddit'
  | 'bluesky'
  | 'polymarket'
  | 'wikipedia'
  | 'gdelt'
  | 'sensors';

/**
 * Status for each source in the per-system coverage strip.
 *
 *   - 'hit'        — we queried and got at least one usable row.
 *   - 'miss'       — we queried and got nothing matching.
 *   - 'skipped'    — we intentionally didn't query (e.g. sensors skipped
 *                    because the topic isn't a physical event).
 *   - 'unavailable'— the system requires config (API key) that isn't set.
 *   - 'error'      — the HTTP call failed / timed out. Not a data signal.
 */
export type SourceStatus = 'hit' | 'miss' | 'skipped' | 'unavailable' | 'error';

export interface SourceQuery {
  /** Cleanest headline we have. Used as the primary search query. */
  title: string | null;
  /** og:description / meta description, when we have it. */
  description: string | null;
  /** The user's pasted URL after canonicalization. */
  canonicalUrl: string | null;
  /** The host of `canonicalUrl`, stripped of `www.`, for self-exclusion. */
  host: string | null;
  /** Stopword-filtered content terms extracted from title + text. */
  keywords: string[];
  /** Raw pasted text, if the submission was a text claim. */
  text: string | null;
}

export interface SourceResult {
  id: SourceId;
  name: string;
  status: SourceStatus;
  /** Number of EvidenceItems this source contributed. */
  hits: number;
  /** One-sentence explanation for the UI. Always safe to render. */
  note: string;
  /** New EvidenceItems to fold into the confidence engine. */
  evidence: EvidenceItem[];
  /**
   * Optional physical-evidence payload. Only sensors populate this.
   * When present, the orchestrator merges it into the report.
   */
  physical_evidence?: PhysicalEvidence | null;
}

/** Lightweight searcher signature — all live-source modules export this. */
export type SourceSearcher = (
  q: SourceQuery,
) => Promise<SourceResult>;

/** Human-readable display name per source, used in the UI strip. */
export const SOURCE_NAMES: Record<SourceId, string> = {
  tracked_events: 'Tracked events',
  web: 'Web search',
  reddit: 'Reddit',
  bluesky: 'Bluesky',
  polymarket: 'Polymarket',
  wikipedia: 'Wikipedia',
  gdelt: 'GDELT global news',
  sensors: 'Sensor networks',
};
