/**
 * Plain-language trust explainer (AI trust platform plan, capability 2).
 *
 * Goal: every user-facing surface (feed card, signal page, briefing,
 * verify hero) shares one deterministic explanation generator that:
 *
 *   1. Speaks like a careful analyst, not a model or a lawyer.
 *   2. Refuses absolute-truth phrasing ("this is true", "verified",
 *      "confirmed motive", "this side is lying", "this is propaganda").
 *      Instead it describes corroboration, agreement, conflict, and gaps.
 *   3. Always points the reader to a deeper surface ("Learn more"):
 *      evidence list, source comparison, or `/trust` methodology.
 *
 * The explainer composes the existing `ConfidenceReport` plus a few
 * structural counters (sources, contradictions, evidence) — it does NOT
 * reach into raw evidence text and never invents new facts. AI output
 * built on top of this contract should consume `summary`, `why_bullets`,
 * and `watch_for` directly, never paraphrase them.
 *
 * This module is LLM-free, network-free, and pure.
 */

import type { ConfidenceBand, ConfidenceReport } from './confidence';
import type { PhysicalEvidence } from './evidence';

export interface TrustExplanationInput {
  report: ConfidenceReport;
  source_count: number;
  credible_source_count: number;
  contradictions_count: number;
  /** Most contradictions involve at most a handful of types. */
  contradiction_types?: Array<'numeric_conflict' | 'presence_conflict' | 'cause_conflict' | string>;
  physical_evidence?: PhysicalEvidence | null;
  /** True when the syndication detector flagged duplicate wire copies. */
  syndicated?: boolean;
  /** True when the contradiction detector skipped this signal (too complex). */
  complex_signal?: boolean;
  /** A friendly title for the explanation header (signal title). */
  title?: string;
}

export interface TrustLearnMoreLink {
  /** Short label, intended for an inline pill button. */
  label: string;
  /** Path within the app, never an external URL. */
  href: string;
  /** Why this link helps the reader — used for tooltips / aria-label. */
  hint: string;
}

export interface TrustExplanation {
  /** One sentence the reader sees first. Always plain English. */
  summary: string;
  /** 1–3 short bullets explaining the corroboration shape. */
  why_bullets: string[];
  /** Optional "watch for" line — what to be careful about when sharing. */
  watch_for: string | null;
  /** Always non-empty: every explanation links to a deeper surface. */
  learn_more: TrustLearnMoreLink[];
}

/** Phrases that absolutely must not appear in user-facing trust copy. */
export const FORBIDDEN_TRUST_PHRASES: readonly RegExp[] = [
  /\bthis is true\b/i,
  /\bthis is false\b/i,
  /\bAI verified\b/i,
  /\bfact[- ]checked\b/i,
  /\bverified facts?\b/i,
  /\bdebunked\b/i,
  /\bthis is propaganda\b/i,
  /\bthis side is lying\b/i,
  /\b(confirmed|definitive|proven)\s+motive\b/i,
];

/**
 * Build a plain-language trust explanation for a signal.
 *
 * The function never invents new facts. It maps the existing
 * `ConfidenceReport` band + structural counters into a stable string
 * shape that the UI can render directly. Tests assert that the result
 * never contains any phrase in `FORBIDDEN_TRUST_PHRASES`.
 */
export function buildTrustExplanation(
  input: TrustExplanationInput,
): TrustExplanation {
  const band = input.report.band;
  const contraTypes = input.contradiction_types ?? [];
  const summary = buildSummary(input);
  const why = buildWhy(input);
  const watch = buildWatchFor(input, contraTypes);
  const learnMore = buildLearnMoreLinks(band, input);

  // Defensive guard: strip any string that contains a forbidden phrase.
  // We never want a future tweak to accidentally smuggle a truth claim
  // through this surface — better to drop a bullet than mislead readers.
  const safeSummary = stripIfForbidden(summary) ?? FALLBACK_SUMMARY;
  const safeWhy = why.map(stripIfForbidden).filter((b): b is string => Boolean(b));

  return {
    summary: safeSummary,
    why_bullets: safeWhy.slice(0, 3),
    watch_for: watch ? stripIfForbidden(watch) : null,
    learn_more: learnMore,
  };
}

const FALLBACK_SUMMARY =
  'Read the underlying sources before sharing specifics — corroboration is still developing.';

function buildSummary(input: TrustExplanationInput): string {
  const { report, contradictions_count: cc } = input;
  if (cc > 0) {
    return 'Different outlets are reporting different things about important parts of this story.';
  }
  switch (report.band) {
    case 'high':
      return input.credible_source_count >= 4
        ? `${input.credible_source_count} independent outlets on our trusted-source list are all reporting this.`
        : 'A lot of independent reporting supports the basic shape of this event.';
    case 'medium':
      return input.syndicated
        ? 'Several articles repeat the same wire report — that is useful coverage, but it is not the same as many independent confirmations.'
        : 'This story is still developing. Several sources report the event, but the details are not all settled yet.';
    case 'low':
      if (input.source_count <= 1) {
        return 'We have only seen one source for this so far. Read it directly and watch for others picking it up.';
      }
      return `${input.source_count} sources are reporting this, but we have not been able to independently corroborate the details yet.`;
    case 'contested':
      return 'Different outlets are reporting different things about important parts of this story.';
  }
}

function buildWhy(input: TrustExplanationInput): string[] {
  const out: string[] = [];

  // Lead with corroboration shape (mirrors the existing confidence
  // bullets but in slightly friendlier language).
  if (input.source_count > 0) {
    const others = Math.max(0, input.source_count - input.credible_source_count);
    if (input.credible_source_count >= 2) {
      out.push(
        others > 0
          ? `${input.source_count} sources are reporting this — ${input.credible_source_count} from outlets on our trusted-source list, plus ${others} we have not rated yet.`
          : `${input.credible_source_count} outlets on our trusted-source list are independently reporting the same event.`,
      );
    } else if (input.credible_source_count === 1) {
      out.push(
        'One outlet on our trusted-source list is reporting this. Watching for independent confirmation from others.',
      );
    } else if (input.source_count >= 5) {
      out.push(
        `${input.source_count} independent sources are reporting this. None are on our trusted-source list yet — read them yourself before relying on specifics.`,
      );
    } else if (input.source_count >= 2) {
      out.push(
        `${input.source_count} sources are reporting this so far, but none have been rated against our trusted-source list yet.`,
      );
    } else {
      out.push('Only one source is reporting this so far. That is not enough to judge reliability.');
    }
  }

  if (input.contradictions_count > 0) {
    const kinds = (input.contradiction_types ?? []).map(shortConflictKind);
    const unique = [...new Set(kinds)].filter(Boolean);
    if (unique.length > 0) {
      out.push(`Reports disagree on ${unique.join(', ')}. Both sides are listed below with citations.`);
    } else {
      out.push('Reports disagree on a material detail. Both sides are listed below with citations.');
    }
  }

  if (input.physical_evidence) {
    if (input.physical_evidence.status === 'confirmed') {
      out.push('Open sensor networks picked up something matching this description.');
    } else if (input.physical_evidence.status === 'partial') {
      out.push('Sensor networks partially confirm something is happening, but coverage is incomplete.');
    } else if (input.physical_evidence.status === 'none_detected') {
      out.push(
        'Open sensor networks have not detected supporting evidence in this window — that describes coverage, not whether the event happened.',
      );
    }
  }

  if (input.syndicated && out.length < 3) {
    out.push(
      'Several of these reports appear to repeat the same wire report rather than reporting independently.',
    );
  }

  if (input.complex_signal && out.length < 3) {
    out.push(
      'This story has many sources and moving parts — automatic source-disagreement detection was skipped, so review the evidence list directly.',
    );
  }

  return out;
}

function buildWatchFor(
  input: TrustExplanationInput,
  contraTypes: string[],
): string | null {
  if (input.contradictions_count > 0) {
    if (contraTypes.includes('cause_conflict')) {
      return 'Be careful with posts that state the cause or motive as settled — that part is disputed.';
    }
    if (contraTypes.includes('numeric_conflict')) {
      return 'Numbers (casualty counts, magnitudes, totals) are still moving. Wait for them to settle before sharing specifics.';
    }
    return 'Hold off on sharing specific claims until the disagreement settles.';
  }
  if (input.report.band === 'low' && input.source_count <= 1) {
    return 'Single-source reports change a lot in the first hours. Wait for corroboration before trusting the detail.';
  }
  if (input.syndicated) {
    return 'Watch out for posts treating wire copies as independent confirmation — they are not.';
  }
  return null;
}

function buildLearnMoreLinks(
  band: ConfidenceBand,
  input: TrustExplanationInput,
): TrustLearnMoreLink[] {
  const out: TrustLearnMoreLink[] = [];
  if (input.contradictions_count > 0) {
    out.push({
      label: 'Compare what sources disagree on',
      href: '#source-disagreement',
      hint: 'Open the source-disagreement section on this page to inspect both sides with citations.',
    });
  }
  if (input.physical_evidence) {
    out.push({
      label: 'See physical evidence record',
      href: '#physical-evidence',
      hint: 'Sensor networks and what they did or did not detect in this window.',
    });
  }
  out.push({
    label: 'See all evidence',
    href: '#all-evidence',
    hint: 'Full list of articles, posts, and sensor records that fed this signal.',
  });
  out.push({
    label: 'How we judge reliability',
    href: '/trust',
    hint: 'Methodology for reliability labels, confidence bands, and where AI is and is not used.',
  });
  if (band === 'low' || band === 'contested') {
    out.push({
      label: 'How to read disputed reporting',
      href: '/trust#source-disagreement',
      hint: 'Plain-English guide for inspecting contested events without picking a side.',
    });
  }
  return out;
}

function shortConflictKind(t: string): string {
  switch (t) {
    case 'numeric_conflict':
      return 'numbers';
    case 'presence_conflict':
      return 'what is happening';
    case 'cause_conflict':
      return 'cause or attribution';
    default:
      return 'material details';
  }
}

function stripIfForbidden(line: string | null | undefined): string | null {
  if (!line) return null;
  for (const rx of FORBIDDEN_TRUST_PHRASES) {
    if (rx.test(line)) return null;
  }
  return line;
}

/**
 * Internal helper for tests — exposes the safety check on a single
 * candidate string. Returns true when the string is safe to render to a
 * reader.
 */
export function isPlainTrustSafe(s: string): boolean {
  return !FORBIDDEN_TRUST_PHRASES.some((rx) => rx.test(s));
}
