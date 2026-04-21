/**
 * Dynamic source credibility via Exponential Moving Average (EMA).
 *
 * The methodology page promises: "Credibility is a rolling weighting based
 * on how consistently a source corroborates with others." This module
 * implements that promise.
 *
 * How it works:
 *   For each source, we track a running credibility score using EMA:
 *     new_score = λ * observation + (1 - λ) * old_score
 *
 *   Where `observation` is derived from the source's behavior in a signal:
 *     - Source appeared in a corroborated signal (verification_status = 'verified')
 *       → observation = old_score + CORROBORATION_BOOST
 *     - Source appeared in a developing signal → observation = old_score (neutral)
 *     - Source appeared in a signal with contradictions → observation = old_score - CONTRADICTION_PENALTY
 *     - Source was the sole source on a signal that was later corroborated
 *       by credible outlets → observation = old_score + EARLY_REPORTER_BOOST
 *
 *   λ (lambda) controls how quickly the score adapts:
 *     - λ = 0.1: slow adaptation, stable scores (recommended for news)
 *     - λ = 0.2: moderate adaptation
 *
 * Guard rails:
 *   - Scores are clamped to [10, 95] — no source ever hits 0 or 100.
 *   - Sensor sources (USGS, NASA, NOAA) have a floor of 80.
 *   - Wire services (Reuters, AP, AFP) have a floor of 75.
 *   - Changes are computed but NOT written directly to DB from this module.
 *     The ingest pipeline calls this and decides when to persist.
 */

import type { VerificationStatus } from './types';
import { clamp } from './scoring';

const LAMBDA = 0.1;
const CORROBORATION_BOOST = 8;
const CONTRADICTION_PENALTY = 5;
const EARLY_REPORTER_BOOST = 4;
const MIN_SCORE = 10;
const MAX_SCORE = 95;
const SENSOR_FLOOR = 80;
const WIRE_FLOOR = 75;

const SENSOR_SOURCES = new Set([
  'usgs-quakes', 'usgs-significant', 'nasa-eonet', 'nasa-eo-hazards',
  'noaa-alerts', 'open-meteo-global', 'swpc-alerts', 'gdacs-alerts',
  'nasa-firms',
]);

const WIRE_SOURCES = new Set([
  'reuters-world', 'reuters-americas', 'apnews-top', 'afp-en',
]);

export interface CredibilityUpdate {
  source_id: string;
  old_score: number;
  new_score: number;
  delta: number;
  reason: string;
}

export interface SignalOutcome {
  signal_id: string;
  verification_status: VerificationStatus;
  source_ids: string[];
  has_contradictions: boolean;
  credible_source_count: number;
}

/**
 * Compute credibility updates for all sources involved in a set of signal
 * outcomes. Returns an array of updates, one per source that changed.
 *
 * @param outcomes - Signal outcomes from the current ingest run
 * @param currentScores - Current credibility scores by source_id
 */
export function computeCredibilityUpdates(
  outcomes: SignalOutcome[],
  currentScores: Map<string, number>,
): CredibilityUpdate[] {
  const accumulatedObservations = new Map<string, { sum: number; count: number }>();

  for (const outcome of outcomes) {
    for (const sourceId of outcome.source_ids) {
      const oldScore = currentScores.get(sourceId) ?? 50;
      let observation = oldScore;
      let reason = 'neutral';

      if (outcome.verification_status === 'verified') {
        observation = oldScore + CORROBORATION_BOOST;
        reason = 'corroborated';
      } else if (outcome.verification_status === 'developing' && outcome.credible_source_count >= 1) {
        observation = oldScore + EARLY_REPORTER_BOOST;
        reason = 'early_reporter';
      }

      if (outcome.has_contradictions) {
        observation -= CONTRADICTION_PENALTY;
        reason = reason === 'neutral' ? 'contradicted' : `${reason}+contradicted`;
      }

      const acc = accumulatedObservations.get(sourceId) ?? { sum: 0, count: 0 };
      acc.sum += observation;
      acc.count += 1;
      accumulatedObservations.set(sourceId, acc);
    }
  }

  const updates: CredibilityUpdate[] = [];
  for (const [sourceId, { sum, count }] of accumulatedObservations) {
    const oldScore = currentScores.get(sourceId) ?? 50;
    const avgObservation = sum / count;
    let rawNew = LAMBDA * avgObservation + (1 - LAMBDA) * oldScore;

    // Apply floors for sensor and wire sources
    if (SENSOR_SOURCES.has(sourceId)) {
      rawNew = Math.max(rawNew, SENSOR_FLOOR);
    } else if (WIRE_SOURCES.has(sourceId)) {
      rawNew = Math.max(rawNew, WIRE_FLOOR);
    }

    const newScore = Math.round(clamp(rawNew, MIN_SCORE, MAX_SCORE));
    const delta = newScore - oldScore;

    if (delta !== 0) {
      updates.push({
        source_id: sourceId,
        old_score: oldScore,
        new_score: newScore,
        delta,
        reason: delta > 0 ? 'corroboration_trend' : 'contradiction_trend',
      });
    }
  }

  return updates;
}

export { LAMBDA, CORROBORATION_BOOST, CONTRADICTION_PENALTY, SENSOR_FLOOR, WIRE_FLOOR };
