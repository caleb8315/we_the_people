/**
 * Confidence breakdown (April 2026 upgrade — fifth ship of the evidence
 * comparison upgrade plan).
 *
 * The existing `buildConfidenceReport` engine emits ONE 4-band verdict
 * (`high | medium | low | contested`). It is correct and well-tested,
 * and we don't replace it. This module sits *next to* it and produces
 * a 4-component breakdown that explains *why* a given band landed:
 *
 *   source_agreement        do sources broadly agree on the claim shape?
 *   source_quality          is the corpus made of primaries / officials
 *                           / rated outlets, or social posts and
 *                           aggregators?
 *   claim_directness        how directly is the claim addressed —
 *                           anchor URL + on-topic primaries → high,
 *                           an aggregator + a tweet → low.
 *   evidence_completeness   do we have enough to compare? small corpus
 *                           or major missing-context flag → low.
 *
 * The composite of these four IS the confidence score we surface
 * alongside the band. The plan also calls for the score to drop when
 * sources are weak, circular, or incomplete — captured by the
 * "circular" penalty (when many sources are syndicated/owned) and by
 * the completeness component itself.
 *
 * Pure / deterministic / LLM-free.
 */

import type {
  RankedSource,
  RankedSourceSummary,
} from './source-ranking';
import type {
  AnalyzedConflict,
  ConflictSummary,
} from './conflict-analysis';
import type { EvidenceCardSummary } from './evidence-cards';
import type { ConfidenceBand } from './confidence';

export interface ConfidenceComponent {
  /** 0–100. Higher = stronger contribution. */
  score: number;
  /** 1–2 plain sentences explaining the score. */
  reasons: string[];
}

export interface ConfidenceBreakdown {
  /** Composite, 0–100. */
  composite: number;
  /** Mirrored band — recomputed from the composite for transparency. */
  band: ConfidenceBand;
  components: {
    source_agreement: ConfidenceComponent;
    source_quality: ConfidenceComponent;
    claim_directness: ConfidenceComponent;
    evidence_completeness: ConfidenceComponent;
  };
  /** Total weighted penalty applied (0–60 typical). */
  penalty: number;
  /** Human-readable list of the penalties applied. */
  penalty_reasons: string[];
}

export interface BuildConfidenceBreakdownInput {
  ranked: RankedSource[];
  ranked_summary: RankedSourceSummary;
  conflicts: AnalyzedConflict[];
  conflict_summary: ConflictSummary;
  cards_summary: EvidenceCardSummary;
  /** True when the user submission was a URL we matched into the corpus. */
  has_anchor: boolean;
  /** Set when the user submitted text only — directness is naturally lower. */
  is_text_only: boolean;
  /** Cap-at-medium flag (e.g. social submissions). */
  cap_at_medium?: boolean;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function bandFromComposite(score: number, contradictions: number, capAtMedium: boolean): ConfidenceBand {
  if (contradictions > 0) return 'contested';
  let band: ConfidenceBand;
  if (score >= 70) band = 'high';
  else if (score >= 45) band = 'medium';
  else band = 'low';
  if (capAtMedium && band === 'high') band = 'medium';
  return band;
}

function buildSourceAgreement(
  s: RankedSourceSummary,
  conflicts: AnalyzedConflict[],
): ConfidenceComponent {
  const reasons: string[] = [];
  if (s.total === 0) {
    return {
      score: 0,
      reasons: ['No corroborating sources found.'],
    };
  }
  const directContradictions = conflicts.filter(
    (c) => c.type === 'direct_contradiction' || c.type === 'framing_difference',
  );
  let score: number;
  if (directContradictions.length > 0) {
    const worst = Math.max(...directContradictions.map((c) => c.severity_score));
    score = clamp(70 - worst * 0.5, 10, 60);
    reasons.push('Sources disagree on at least one material detail (see conflicts section).');
  } else if (s.total >= 4) {
    score = 90;
    reasons.push(`${s.total} sources independently describe the event the same way.`);
  } else if (s.total >= 2) {
    score = 70;
    reasons.push(`${s.total} sources describe the event consistently.`);
  } else {
    score = 35;
    reasons.push('Only one source — agreement cannot be evaluated yet.');
  }
  if (s.syndicated_or_owned >= 2 && score >= 70) {
    score = clamp(score - 12, 0, 100);
    reasons.push('Multiple sources share an owner or look like wire restatements — agreement weighted down.');
  }
  return { score: Math.round(score), reasons: reasons.slice(0, 2) };
}

function buildSourceQuality(s: RankedSourceSummary): ConfidenceComponent {
  if (s.total === 0) {
    return { score: 0, reasons: ['No sources to evaluate.'] };
  }
  let score = 30;
  const reasons: string[] = [];
  if (s.primaries > 0) {
    score += 30;
    reasons.push(`${s.primaries} primary observation${s.primaries === 1 ? '' : 's'} (sensor or first-party).`);
  }
  if (s.officials > 0) {
    score += 18;
    reasons.push(`${s.officials} official bulletin${s.officials === 1 ? '' : 's'}.`);
  }
  if (s.rated_outlets >= 2) {
    score += 22;
    reasons.push(`${s.rated_outlets} rated outlets in the mix.`);
  } else if (s.rated_outlets === 1) {
    score += 10;
    reasons.push('One rated outlet — promising but not a quorum.');
  }
  if (s.aggregators > s.rated_outlets + s.primaries) {
    score -= 15;
    reasons.push('Aggregators / republishers dominate the mix.');
  }
  if (s.social_posts > 0 && s.rated_outlets === 0 && s.primaries === 0) {
    score -= 12;
    reasons.push('Mostly social posts — useful for awareness, weak as evidence.');
  }
  if (s.references > 0 && s.rated_outlets === 0 && s.primaries === 0) {
    reasons.push('Reference works only — useful for context, not direct corroboration.');
  }
  if (reasons.length === 0) {
    reasons.push('Mixed sources without dominant primaries or rated outlets.');
  }
  return { score: Math.round(clamp(score, 0, 100)), reasons: reasons.slice(0, 2) };
}

function buildClaimDirectness(
  ranked: RankedSource[],
  hasAnchor: boolean,
  isTextOnly: boolean,
): ConfidenceComponent {
  if (ranked.length === 0) {
    return { score: 0, reasons: ['No evidence to compare against the claim.'] };
  }
  // Average of top 3 directness components, with a small bump if we
  // have an anchor URL we matched.
  const top = ranked.slice(0, 3);
  const avg = top.reduce((acc, r) => acc + r.components.directness, 0) / top.length;
  let score = avg;
  const reasons: string[] = [];
  if (hasAnchor) {
    score = Math.min(100, score + 6);
    reasons.push('Anchor URL is included in the comparison.');
  }
  if (isTextOnly) {
    score = clamp(score - 14, 0, 100);
    reasons.push('No source link attached — directness reduced for text-only submissions.');
  }
  if (top.some((r) => r.role === 'primary' || r.role === 'official')) {
    reasons.push('Top-ranked source is a primary observation or official bulletin.');
  } else if (top.every((r) => r.role === 'aggregator' || r.role === 'social')) {
    score = clamp(score - 10, 0, 100);
    reasons.push('Top-ranked sources are aggregators or social posts.');
  }
  if (reasons.length === 0) {
    reasons.push('Top-ranked sources address the claim with mixed directness.');
  }
  return { score: Math.round(clamp(score, 0, 100)), reasons: reasons.slice(0, 2) };
}

function buildEvidenceCompleteness(
  cards: EvidenceCardSummary,
  conflicts: ConflictSummary,
): ConfidenceComponent {
  const reasons: string[] = [];
  let score = 30;
  if (cards.total === 0) {
    return { score: 0, reasons: ['No evidence cards available.'] };
  }
  if (cards.total >= 5) {
    score = 80;
    reasons.push(`${cards.total} evidence rows give the comparison a solid base.`);
  } else if (cards.total >= 3) {
    score = 65;
    reasons.push(`${cards.total} evidence rows — comparison is reasonable but thin.`);
  } else if (cards.total === 2) {
    score = 45;
    reasons.push('Only two evidence rows — comparison is fragile.');
  } else {
    score = 20;
    reasons.push('Only one evidence row — comparison cannot be made yet.');
  }
  if (conflicts.by_type.missing_context > 0) {
    score = clamp(score - 18, 0, 100);
    reasons.push('Specific details from the claim are not corroborated by any source.');
  }
  if (conflicts.by_type.insufficient_evidence > 0 && cards.total >= 3) {
    score = clamp(score - 8, 0, 100);
    reasons.push('Comparison flagged as thin in the conflict analysis.');
  }
  if (cards.supports >= cards.total - 1 && cards.total >= 3) {
    score = clamp(score + 8, 0, 100);
    reasons.push('Most evidence rows are supportive of the claim shape.');
  }
  return { score: Math.round(clamp(score, 0, 100)), reasons: reasons.slice(0, 2) };
}

const W = {
  source_agreement: 0.3,
  source_quality: 0.3,
  claim_directness: 0.2,
  evidence_completeness: 0.2,
};

export function buildConfidenceBreakdown(
  input: BuildConfidenceBreakdownInput,
): ConfidenceBreakdown {
  const agreement = buildSourceAgreement(input.ranked_summary, input.conflicts);
  const quality = buildSourceQuality(input.ranked_summary);
  const directness = buildClaimDirectness(
    input.ranked,
    input.has_anchor,
    input.is_text_only,
  );
  const completeness = buildEvidenceCompleteness(input.cards_summary, input.conflict_summary);

  // Penalties for circular / weak / incomplete corpora. Capped so a
  // contested high-quality comparison still surfaces meaningfully.
  let penalty = 0;
  const penaltyReasons: string[] = [];
  if (input.ranked_summary.syndicated_or_owned >= 2) {
    penalty += 8;
    penaltyReasons.push('Multiple sources are likely circular (shared owner / wire syndication).');
  }
  if (input.ranked_summary.total <= 1) {
    penalty += 12;
    penaltyReasons.push('Single-source comparison cannot be triangulated.');
  }
  if (input.conflict_summary.only_insufficient) {
    penalty += 10;
    penaltyReasons.push('Conflict analysis only fired the "insufficient evidence" flag.');
  }
  penalty = Math.min(60, penalty);

  const composite = Math.round(
    clamp(
      agreement.score * W.source_agreement +
        quality.score * W.source_quality +
        directness.score * W.claim_directness +
        completeness.score * W.evidence_completeness -
        penalty,
      0,
      100,
    ),
  );
  const directContradictions = input.conflicts.filter(
    (c) => c.type === 'direct_contradiction' || c.type === 'framing_difference',
  ).length;
  const band = bandFromComposite(composite, directContradictions, Boolean(input.cap_at_medium));

  return {
    composite,
    band,
    components: {
      source_agreement: agreement,
      source_quality: quality,
      claim_directness: directness,
      evidence_completeness: completeness,
    },
    penalty,
    penalty_reasons: penaltyReasons,
  };
}
