import type { ConfidenceLabel, EvidenceItem, Signal } from './types';
import type { Claim, DetectedContradiction } from './contradictions';

/**
 * Severity: how materially significant the event is.
 * Confidence: how sure we are the event is real as reported.
 *
 * Both are 0–100 and derived from heuristics before any LLM call.
 *
 * As of phase 2 this file ALSO computes four additional reliability
 * dimensions (agreement / source-independence / narrative-divergence /
 * evidence-strength) and a composite `reliability_score`. Those augment —
 * they do NOT replace — `severity`, `confidence`, or `verification_status`.
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
 * Blended heuristic — all free, no LLM required. The bonus reflects how well
 * corroborated the signal is, not any claim about factual truth.
 */
export function rankScore(s: Signal): number {
  const corroborationBoost =
    s.verification_status === 'verified' ? 20 :
    s.verification_status === 'developing' ? 10 : 0;
  return clamp(s.severity * 0.6 + s.confidence * 0.3 + corroborationBoost, 0, 100);
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 2 — reliability dimensions (augment existing scoring, never replace).
// ───────────────────────────────────────────────────────────────────────────

export interface ReliabilityInputs {
  /** Evidence rows attached to the signal. */
  evidence: EvidenceItem[];
  /**
   * Claims extracted from the evidence (via `extractClaimsFromEvidence`).
   * Optional: when omitted we conservatively assume every source agrees
   * (dominant claim count = total sources).
   */
  claims?: Claim[];
  /** Contradictions detected for the signal (via `detectInconsistencies`). */
  contradictions: DetectedContradiction[];
}

export interface ReliabilityBreakdown {
  // The four new dimensions — each 0–100.
  agreement_score: number;
  source_independence_score: number;
  narrative_divergence_score: number;
  evidence_strength_score: number;
  /** Composite score, clamped to 0–100. */
  reliability_score: number;
  /** Supporting facts, kept so /ops and debugging can see why a score landed. */
  details: {
    total_sources: number;
    distinct_domains: number;
    credible_sources: number;
    dominant_claim_count: number;
    dominant_claim_ratio: number;
    contradictions_count: number;
    usgs_match: boolean;
    eonet_match: boolean;
  };
}

const USGS_DOMAINS = ['usgs.gov', 'earthquake.usgs.gov', 'volcanoes.usgs.gov'];
const EONET_DOMAINS = ['eonet.gsfc.nasa.gov', 'eonet.sci.gsfc.nasa.gov'];
const NASA_DOMAINS = ['nasa.gov'];

function normalizeDomain(domain: string): string {
  return (domain ?? '').toLowerCase().replace(/^www\./, '');
}

function matchesAny(domain: string, needles: string[]): boolean {
  const d = normalizeDomain(domain);
  if (!d) return false;
  return needles.some((n) => d === n || d.endsWith('.' + n));
}

/**
 * Signature used to cluster claims for the agreement score.
 * Two claims share a signature when their "shape" of the event agrees:
 *   - the same headline-number order of magnitude (so 3 and 5 cluster,
 *     3 and 30 do not);
 *   - the same presence flags (ceasefire / kinetic / accident / attack).
 * Attribution phrases, when present, also split clusters so that two sources
 * naming different actors aren't treated as "agreeing".
 */
function claimSignature(c: Claim): string {
  const n = c.numbers[0];
  const magnitude =
    n === undefined
      ? 'n:na'
      : n === 0
        ? 'n:0'
        : `n:${Math.floor(Math.log2(Math.max(1, n)))}`;
  const flags = [
    c.ceasefire ? 'C' : '-',
    c.kinetic ? 'K' : '-',
    c.accident ? 'A' : '-',
    c.attack ? 'X' : '-',
  ].join('');
  const attrib = c.attribution[0] ? `a:${c.attribution[0]}` : 'a:none';
  return `${magnitude}|${flags}|${attrib}`;
}

function dominantClaimCount(claims: Claim[]): number {
  if (claims.length === 0) return 0;
  const buckets = new Map<string, number>();
  for (const c of claims) {
    const sig = claimSignature(c);
    buckets.set(sig, (buckets.get(sig) ?? 0) + 1);
  }
  let max = 0;
  for (const count of buckets.values()) if (count > max) max = count;
  return max;
}

/**
 * Compute the four phase-2 reliability dimensions and the composite
 * `reliability_score`. Pure function, zero side effects, no LLM calls.
 *
 * Formula (exact, not approximate):
 *   agreement_score            = (dominant_claim_count / total_sources) * 100
 *   source_independence_score  = (distinct_domains / total_sources) * 100
 *   narrative_divergence_score = min(100, contradictions.length * 25)
 *   evidence_strength_score    = (usgs_match ? 40 : 0)
 *                              + (eonet_match ? 30 : 0)
 *                              + (credible_sources > 1 ? 30 : 0)
 *
 *   reliability_score = clamp(
 *       agreement_score            * 0.35
 *     + source_independence_score  * 0.20
 *     + evidence_strength_score    * 0.25
 *     - narrative_divergence_score * 0.40,
 *     0, 100
 *   )
 */
export function computeReliabilityScores(input: ReliabilityInputs): ReliabilityBreakdown {
  const total_sources = Math.max(1, input.evidence.length);
  const domains = new Set<string>();
  let credible_sources = 0;
  let usgs_match = false;
  let eonet_match = false;

  const credibleDomainSet = new Set<string>();
  for (const e of input.evidence) {
    const d = normalizeDomain(e.domain);
    if (d) domains.add(d);
    if (e.is_credible && d) credibleDomainSet.add(d);
    if (matchesAny(d, USGS_DOMAINS) || e.source_id === 'usgs') usgs_match = true;
    if (
      matchesAny(d, EONET_DOMAINS) ||
      e.source_id === 'nasa-eonet' ||
      matchesAny(d, NASA_DOMAINS)
    ) {
      eonet_match = true;
    }
  }
  credible_sources = credibleDomainSet.size;

  const distinct_domains = domains.size;
  // When no claims are supplied, fall back to "every source agrees" so we
  // never over-penalize a signal the caller hasn't fully analysed.
  const dominant_claim_count =
    input.claims && input.claims.length > 0
      ? dominantClaimCount(input.claims)
      : total_sources;
  const dominant_claim_ratio = dominant_claim_count / total_sources;

  const agreement_score = clamp(dominant_claim_ratio * 100, 0, 100);
  const source_independence_score = clamp((distinct_domains / total_sources) * 100, 0, 100);
  const narrative_divergence_score = clamp(input.contradictions.length * 25, 0, 100);
  const evidence_strength_score = clamp(
    (usgs_match ? 40 : 0) + (eonet_match ? 30 : 0) + (credible_sources > 1 ? 30 : 0),
    0,
    100,
  );

  const reliability_score = clamp(
    agreement_score * 0.35 +
      source_independence_score * 0.2 +
      evidence_strength_score * 0.25 -
      narrative_divergence_score * 0.4,
    0,
    100,
  );

  return {
    agreement_score: Math.round(agreement_score),
    source_independence_score: Math.round(source_independence_score),
    narrative_divergence_score: Math.round(narrative_divergence_score),
    evidence_strength_score: Math.round(evidence_strength_score),
    reliability_score: Math.round(reliability_score),
    details: {
      total_sources,
      distinct_domains,
      credible_sources,
      dominant_claim_count,
      dominant_claim_ratio: Number(dominant_claim_ratio.toFixed(3)),
      contradictions_count: input.contradictions.length,
      usgs_match,
      eonet_match,
    },
  };
}

/** Internal low/medium/high band for the composite reliability score. */
export function reliabilityLabel(score: number): ConfidenceLabel {
  if (score >= 65) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 3 — user-facing label + summary contract.
// The internal `reliabilityLabel` above is kept untouched; these additions
// expose a separate, machine-stable tag that the API, UI, and any downstream
// consumer can rely on.
// ───────────────────────────────────────────────────────────────────────────

export type ReliabilityPublicLabel =
  | 'LIKELY_ACCURATE'
  | 'UNCLEAR'
  | 'LIKELY_UNRELIABLE';

/**
 * Map a composite reliability score (0–100) to the public label enum.
 *
 *   score >= 70 → LIKELY_ACCURATE
 *   40–69       → UNCLEAR
 *   < 40        → LIKELY_UNRELIABLE
 *
 * Note: the label describes how well the **reporting** is corroborated across
 * public sources — it is not a factual judgment about the underlying event.
 * The word "accurate" is hedged with "LIKELY" per the contract.
 */
export function reliabilityPublicLabel(score: number): ReliabilityPublicLabel {
  if (score >= 70) return 'LIKELY_ACCURATE';
  if (score >= 40) return 'UNCLEAR';
  return 'LIKELY_UNRELIABLE';
}

export interface ReliabilitySummaryInputs {
  contradictions_count: number;
  evidence_strength_score: number;
  agreement_score: number;
}

/**
 * Non-LLM, deterministic one-sentence description of the signal's current
 * reliability posture. Strict priority order — the first matching rule wins:
 *
 *   1. contradictions_count > 0       → "Sources report conflicting information."
 *   2. evidence_strength_score < 30   → "Limited independent evidence available."
 *   3. agreement_score > 70           → "Multiple sources report consistent details."
 *   4. otherwise                      → "Information is still developing."
 */
export function buildReliabilitySummary(input: ReliabilitySummaryInputs): string {
  if (input.contradictions_count > 0) {
    return 'Sources report conflicting information.';
  }
  if (input.evidence_strength_score < 30) {
    return 'Limited independent evidence available.';
  }
  if (input.agreement_score > 70) {
    return 'Multiple sources report consistent details.';
  }
  return 'Information is still developing.';
}

/** Human display form for the public enum, for UI rendering only. */
export function reliabilityPublicLabelDisplay(label: ReliabilityPublicLabel): string {
  switch (label) {
    case 'LIKELY_ACCURATE':
      return 'Likely accurate';
    case 'UNCLEAR':
      return 'Unclear';
    case 'LIKELY_UNRELIABLE':
      return 'Likely unreliable';
  }
}
