import type { ConfidenceLabel, Signal } from './types';

/**
 * Severity: how materially significant the event is.
 * Confidence: how sure we are the event is real as reported.
 *
 * Both are 0–100 and derived from heuristics before any LLM call.
 */

export function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

export function heuristicSeverity(title: string, summary?: string | null): number {
  const text = `${title}\n${summary ?? ''}`.toLowerCase();
  let score = 25;

  const hi = [
    /kill(ed|ing|s)\s*\d+/,
    /casualt/,
    /magnitude\s*([7-9]|[1-9]\d)/,
    /ceasefire/,
    /nuclear/,
    /invas/,
    /coup/,
    /evacuat/,
    /cyber[- ]?attack/,
  ];
  const mid = [
    /strike/,
    /protest/,
    /explosion/,
    /earthquake/,
    /wildfire/,
    /flood/,
    /cyclone/,
    /hurricane/,
    /breach/,
    /sanction/,
    /outbreak/,
  ];
  const neg = [
    /lgbt/,
    /\bgender/,
    /celebrity/,
    /gossip/,
    /box\s*office/,
    /sports?/,
  ];

  for (const rx of hi) if (rx.test(text)) score += 35;
  for (const rx of mid) if (rx.test(text)) score += 15;
  for (const rx of neg) if (rx.test(text)) score -= 20;

  return clamp(score, 0, 100);
}

export function heuristicConfidence(sourceCount: number, credibleCount: number): number {
  let score = 20;
  score += Math.min(sourceCount, 6) * 8;
  score += Math.min(credibleCount, 4) * 10;
  return clamp(score, 0, 100);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Surface-worthy score for ranking feed and alerts.
 * Blended heuristic — all free, no LLM required.
 */
export function rankScore(s: Signal): number {
  const verifiedBoost =
    s.verification_status === 'verified' ? 20 :
    s.verification_status === 'developing' ? 10 : 0;
  return clamp(s.severity * 0.6 + s.confidence * 0.3 + verifiedBoost, 0, 100);
}
