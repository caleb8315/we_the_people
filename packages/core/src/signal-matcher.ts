/**
 * Cross-run signal matcher.
 *
 * The single biggest reason most signals end up single-source is that
 * clustering only happens within a single ingest batch. If Reuters
 * publishes at 2 PM and BBC at 3 PM, they land in different hourly
 * batches and become separate signals.
 *
 * This module fixes that by comparing new articles against existing
 * signals in the database. When a new article matches an existing
 * signal above the threshold, it adopts the existing signal's
 * dedupe_key, causing the upsert to merge evidence instead of
 * creating a duplicate.
 *
 * No LLM. No external services. Pure deterministic matching.
 */

import { extractRichTerms, weightedJaccard, type RichTermSet } from './cluster';
import { topicGroup } from './topic-groups';

/**
 * Minimal signal shape needed for cross-run matching.
 * Fetched from the database at the start of each ingest run.
 */
export interface ExistingSignal {
  dedupe_key: string;
  title: string;
  topic: string;
  occurred_at: string | null;
}

/**
 * Pre-computed representation for fast matching.
 */
interface PreparedSignal {
  signal: ExistingSignal;
  terms: RichTermSet;
  day: string;
  topicGroup: string;
}

const CROSS_RUN_THRESHOLD = 0.22;
const MAX_DAY_DISTANCE = 2;

/**
 * Pre-process existing signals for fast repeated matching.
 * Call once at the start of an ingest run.
 */
export function prepareExistingSignals(signals: ExistingSignal[]): PreparedSignal[] {
  return signals.map(s => ({
    signal: s,
    terms: extractRichTerms(s.title),
    day: s.occurred_at ? s.occurred_at.slice(0, 10) : '',
    topicGroup: topicGroup(s.topic),
  }));
}

/**
 * Find the best matching existing signal for a new article.
 *
 * Returns the matching signal's dedupe_key, or null if no match
 * exceeds the threshold. The threshold for cross-run matching is
 * slightly higher than intra-batch (0.22 vs 0.18) because we're
 * comparing against a much larger candidate pool and want to
 * avoid false merges.
 *
 * Matching constraints:
 *   1. Topic group must match (war↔civil OK, war↔economy NO)
 *   2. Day distance ≤ MAX_DAY_DISTANCE (articles about events
 *      more than 2 days apart are unlikely to be the same event)
 *   3. Weighted Jaccard ≥ CROSS_RUN_THRESHOLD
 */
export function findMatchingSignal(
  title: string,
  topic: string,
  publishedDay: string,
  prepared: PreparedSignal[],
): { dedupe_key: string; similarity: number } | null {
  const newTerms = extractRichTerms(title);
  const newGroup = topicGroup(topic);

  let bestMatch: { dedupe_key: string; similarity: number } | null = null;

  for (const p of prepared) {
    // Topic group filter
    if (p.topicGroup !== newGroup) continue;

    // Day distance filter
    if (publishedDay && p.day) {
      const distance = dayDistance(publishedDay, p.day);
      if (distance > MAX_DAY_DISTANCE) continue;
    }

    const sim = weightedJaccard(newTerms, p.terms);
    if (sim >= CROSS_RUN_THRESHOLD) {
      if (!bestMatch || sim > bestMatch.similarity) {
        bestMatch = { dedupe_key: p.signal.dedupe_key, similarity: sim };
      }
    }
  }

  return bestMatch;
}

/**
 * Batch version: for each cluster in the current ingest batch,
 * check if it matches an existing signal. Returns a map from
 * the new cluster's generated dedupe_key to the existing signal's
 * dedupe_key that should be used instead.
 */
export function matchClustersToExisting(
  clusters: Array<{
    dedupe_key: string;
    title: string;
    topic: string;
    published_day: string;
  }>,
  prepared: PreparedSignal[],
): Map<string, string> {
  const remapping = new Map<string, string>();

  for (const cluster of clusters) {
    const match = findMatchingSignal(
      cluster.title,
      cluster.topic,
      cluster.published_day,
      prepared,
    );
    if (match) {
      remapping.set(cluster.dedupe_key, match.dedupe_key);
    }
  }

  return remapping;
}

function dayDistance(a: string, b: string): number {
  try {
    const da = new Date(a + 'T00:00:00Z').getTime();
    const db = new Date(b + 'T00:00:00Z').getTime();
    return Math.abs(da - db) / 86_400_000;
  } catch {
    return Infinity;
  }
}

export { CROSS_RUN_THRESHOLD, MAX_DAY_DISTANCE };
