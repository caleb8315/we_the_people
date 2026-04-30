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
import type { AnalyzedConflict } from './conflict-analysis';
import type { CorpusBiasReport } from './bias';
import type { ConfidenceBreakdown } from './confidence-breakdown';
import type { RankedSourceSummary } from './source-ranking';

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
  /**
   * Optional April-2026 evidence-comparison analysis. When passed in, the
   * explainer enriches its existing chips, watch-for hint, and disputed
   * section with the broader conflict taxonomy (framing / timeline /
   * missing context / insufficient evidence) and a strictly-separate
   * bias signal. The ConfidenceReport-driven verdict is unchanged — bias
   * NEVER moves the trust band, by design. When the optional inputs are
   * omitted (legacy callers) the explainer behaves exactly as before.
   */
  analyzed_conflicts?: AnalyzedConflict[];
  bias_report?: CorpusBiasReport | null;
  confidence_breakdown?: ConfidenceBreakdown | null;
  ranked_summary?: RankedSourceSummary | null;
}

export interface TrustLearnMoreLink {
  /** Short label, intended for an inline pill button. */
  label: string;
  /** Path within the app, never an external URL. */
  href: string;
  /** Why this link helps the reader — used for tooltips / aria-label. */
  hint: string;
}

/** Glanceable framing chip. Each carries its own tone so UI surfaces can
 * tint them without re-deriving classes. */
export interface TrustHeadlineChip {
  label: string;
  tone: 'support' | 'dispute' | 'caution' | 'sensor' | 'neutral';
  /** Optional in-page anchor the chip should jump to (#source-disagreement, etc.). */
  href?: string;
  /** Optional tooltip / aria-label expansion for jargon-y labels. */
  hint?: string;
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
  /** Glanceable chips (1–4) summarising the framing at a glance. */
  headline_chips: TrustHeadlineChip[];
  /** What multiple sources broadly agree on (1–3 lines, may be empty). */
  whats_supported: string[];
  /** Where sources disagree or evidence is missing (1–3 lines). */
  whats_disputed: string[];
  /** Things that could change the picture / things to inspect (1–3 lines). */
  whats_unclear: string[];
  /** A short suggested chat-prompt the reader can ask the AI analyst. */
  suggested_prompt: string;
  /**
   * Optional bias-signal hint, populated only when a bias report was
   * passed in AND the bias scorer flagged something material. Always
   * carries the "signal not a verdict" qualifier in the rendered text,
   * and is never combined into the trust band.
   */
  bias_hint: string | null;
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
  const chips = buildHeadlineChips(input);
  const supported = buildWhatsSupported(input).map(safeOrNull).filter(isString);
  const disputed = buildWhatsDisputed(input, contraTypes).map(safeOrNull).filter(isString);
  const unclear = buildWhatsUnclear(input).map(safeOrNull).filter(isString);
  const prompt = buildSuggestedPrompt(input, contraTypes);
  const biasHint = buildBiasHint(input.bias_report ?? null);

  // April 2026 evidence-comparison upgrade — when the caller passes in
  // analyzed_conflicts, fold the broader taxonomy + numeric severity
  // into the disputed list and the headline chips. The ConfidenceReport
  // band is NOT recomputed here; we only enrich the strings + chips so
  // existing callers (signal page trust hero, feed card verdict
  // callout) get the same reading benefit without a separate panel.
  const enrichedDisputed = mergeAnalyzedIntoDisputed(disputed, input.analyzed_conflicts);
  const enrichedChips = mergeAnalyzedIntoChips(chips, input.analyzed_conflicts);
  const enrichedWatch = mergeAnalyzedIntoWatch(watch, input.analyzed_conflicts);

  // Defensive guard: strip any string that contains a forbidden phrase.
  // We never want a future tweak to accidentally smuggle a truth claim
  // through this surface — better to drop a bullet than mislead readers.
  const safeSummary = stripIfForbidden(summary) ?? FALLBACK_SUMMARY;
  const safeWhy = why.map(stripIfForbidden).filter(isString);

  return {
    summary: safeSummary,
    why_bullets: safeWhy.slice(0, 3),
    watch_for: enrichedWatch ? stripIfForbidden(enrichedWatch) : null,
    learn_more: learnMore,
    headline_chips: enrichedChips,
    whats_supported: supported.slice(0, 3),
    whats_disputed: enrichedDisputed.slice(0, 3),
    whats_unclear: unclear.slice(0, 3),
    suggested_prompt: prompt,
    bias_hint: biasHint ? stripIfForbidden(biasHint) : null,
  };
}

// ─── analyzed-conflicts + bias merge helpers ───────────────────────────────

const ANALYZED_LABEL: Record<string, string> = {
  direct_contradiction: 'numbers / what is happening',
  framing_difference: 'cause or attribution',
  timeline_mismatch: 'when the event occurred',
  missing_context: 'specific actors / numbers in the claim',
  insufficient_evidence: 'whether there is enough to compare yet',
};

function mergeAnalyzedIntoDisputed(
  existing: string[],
  conflicts: AnalyzedConflict[] | undefined,
): string[] {
  if (!conflicts || conflicts.length === 0) return existing;
  const out: string[] = [...existing];
  // Pull at most two highest-severity non-trivial conflicts and add a
  // line for each that we don't already cover.
  const top = [...conflicts]
    .filter((c) => c.type !== 'insufficient_evidence')
    .sort((a, b) => b.severity_score - a.severity_score)
    .slice(0, 2);
  for (const c of top) {
    const label = ANALYZED_LABEL[c.type] ?? 'material details';
    const line = `Conflict (${c.label.toLowerCase()}, severity ${c.severity_score}/100): ${truncate(c.summary, 160)}`;
    if (!out.some((l) => l.toLowerCase().includes(label.toLowerCase()))) {
      out.unshift(line);
    } else {
      out.unshift(line);
    }
  }
  return out;
}

function mergeAnalyzedIntoChips(
  existing: TrustHeadlineChip[],
  conflicts: AnalyzedConflict[] | undefined,
): TrustHeadlineChip[] {
  if (!conflicts || conflicts.length === 0) return existing;
  const worst = [...conflicts]
    .filter((c) => c.type !== 'insufficient_evidence')
    .sort((a, b) => b.severity_score - a.severity_score)[0];
  if (!worst) return existing;
  // If there's already a 'dispute'-toned chip, replace its label with a
  // sharper one carrying the numeric severity. Otherwise prepend a new
  // chip so the conflict shows up at the top of the strip.
  const sharper: TrustHeadlineChip = {
    label: `${worst.label} ${worst.severity_score}/100`,
    tone: worst.severity_band === 'high' ? 'dispute' : 'caution',
    href: '#source-disagreement',
    hint: worst.summary,
  };
  const idx = existing.findIndex((c) => c.tone === 'dispute');
  if (idx >= 0) {
    const out = [...existing];
    out[idx] = sharper;
    return out;
  }
  return [sharper, ...existing].slice(0, 4);
}

function mergeAnalyzedIntoWatch(
  existing: string | null,
  conflicts: AnalyzedConflict[] | undefined,
): string | null {
  if (!conflicts || conflicts.length === 0) return existing;
  const timeline = conflicts.find((c) => c.type === 'timeline_mismatch');
  const missing = conflicts.find((c) => c.type === 'missing_context');
  // Promote the most actionable upgrade-class conflict into the
  // glanceable "watch for" hint, since these are the ones a reader can
  // act on. We only override an EXISTING watch line when we have a
  // sharper one to give.
  if (timeline) {
    return `Timeline mismatch (severity ${timeline.severity_score}/100) — sources span more than a day apart, so the corpus may be mixing different incidents.`;
  }
  if (missing) {
    return `Specific details from the claim are not corroborated by any source we found (severity ${missing.severity_score}/100). Verify those details before sharing.`;
  }
  return existing;
}

function buildBiasHint(bias: CorpusBiasReport | null): string | null {
  if (!bias || !bias.has_signal) return null;
  return `Bias signal: ${bias.band} (${bias.avg_intensity}/100). ${bias.summary} This is a reading-comprehension cue, not a verdict on the underlying claim.`;
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

const FALLBACK_SUMMARY =
  'Read the underlying sources before sharing specifics — corroboration is still developing.';

function buildSummary(input: TrustExplanationInput): string {
  const { report, contradictions_count: cc } = input;
  if (cc > 0) {
    return 'Different sites are reporting different things about important parts of this story. We have flagged the specific points where they disagree below.';
  }
  switch (report.band) {
    case 'high':
      if (input.syndicated) {
        return `${input.source_count} sites are carrying this story, but most of them appear to be running the same article. Fewer outlets are reporting it independently than the count suggests.`;
      }
      return input.source_count >= 4
        ? `${input.source_count} different newsrooms are reporting this, and they describe the event the same way.`
        : 'A few different newsrooms are reporting this and they agree on the basic shape of the event.';
    case 'medium':
      if (input.syndicated) {
        return 'A lot of sites are running this story, but most of them appear to be republishing the same article rather than reporting it themselves. Treat the source count as smaller than it looks.';
      }
      return 'This story is still developing. A few sources are reporting it, but the details are not all settled yet.';
    case 'low':
      if (input.source_count <= 1) {
        return 'We have only seen one source for this so far. Read it directly and watch for others picking it up.';
      }
      return `${input.source_count} sources are reporting this, but we have not been able to confirm the details with other independent reporting yet.`;
    case 'contested':
      return 'Different sites are reporting different things about important parts of this story. We have flagged the specific points where they disagree below.';
  }
}

function buildWhy(input: TrustExplanationInput): string[] {
  const out: string[] = [];

  // Lead with the source-count picture. When we have flagged the
  // signal as syndicated, we deliberately do NOT claim the sources are
  // independent — that would directly contradict the syndication
  // bullet we add below.
  if (input.source_count > 0) {
    if (input.syndicated) {
      out.push(
        `${input.source_count} sites are carrying this story, but most of them look like they are running the same article rather than reporting it themselves.`,
      );
    } else if (input.source_count >= 5) {
      out.push(
        `${input.source_count} different newsrooms are reporting this — that is meaningful corroboration when each one is reporting independently.`,
      );
    } else if (input.source_count >= 3) {
      out.push(
        `${input.source_count} sources are reporting this and the core event description is broadly consistent.`,
      );
    } else if (input.source_count === 2) {
      out.push('Two sources are reporting this so far. Helpful signal, but still early.');
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
      out.push('Public sensor networks (earthquakes, weather, satellite hotspots) recorded a matching event.');
    } else if (input.physical_evidence.status === 'partial') {
      out.push('Public sensor networks partially confirm something is happening, but the picture is incomplete.');
    } else if (input.physical_evidence.status === 'none_detected') {
      out.push(
        'Public sensor networks have not picked up matching data in this window. That is a coverage gap, not a verdict on the event itself.',
      );
    }
  }

  if (input.syndicated && out.length < 3) {
    out.push(
      'A republished article (often a single news-agency or press-release piece) gets carried by many sites at once. That looks like wide coverage but is closer to one source than many.',
    );
  }

  if (input.complex_signal && out.length < 3) {
    out.push(
      'This story has many sources and moving parts — automatic disagreement detection was skipped, so look through the evidence list directly.',
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
    return 'Single-source reports change a lot in the first hours. Wait for confirmation from other newsrooms before trusting the detail.';
  }
  if (input.syndicated) {
    return 'A high source count is misleading here — most of these sites are running the same article. Don\u2019t treat that as many newsrooms confirming it independently.';
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

function safeOrNull(line: string): string | null {
  return stripIfForbidden(line);
}

function isString(value: string | null): value is string {
  return Boolean(value);
}

/**
 * Headline framing chips. Up to four glanceable pills the UI can tint
 * inline next to the verdict. They never contain forbidden phrasing.
 */
function buildHeadlineChips(input: TrustExplanationInput): TrustHeadlineChip[] {
  const chips: TrustHeadlineChip[] = [];
  if (input.contradictions_count > 0) {
    chips.push({
      label: input.contradictions_count === 1 ? 'Sources disagree' : `${input.contradictions_count} disputes`,
      tone: 'dispute',
      href: '#source-disagreement',
      hint: 'Open the source-disagreement section below to see exactly what they disagree on.',
    });
  }
  // Source-count chip — but be honest about syndication. When most
  // sites are running the same article the count is misleading, so we
  // tone it amber and use clearer wording. When sources really do look
  // independent, we keep the green support tone.
  if (input.source_count >= 2) {
    if (input.syndicated) {
      chips.push({
        label: `${input.source_count} sites carrying it`,
        tone: 'caution',
        hint:
          'Most of these sites appear to be running the same article rather than reporting it themselves. Treat the count as smaller than it looks.',
      });
    } else {
      chips.push({
        label: `${input.source_count} sources reporting`,
        tone: 'support',
        hint: 'Different newsrooms reporting the same event independently. Each adds real corroboration.',
      });
    }
  } else if (input.source_count <= 1) {
    chips.push({
      label: 'Single source',
      tone: 'caution',
      hint: 'Only one site is reporting this so far. Wait for others to pick it up before trusting specifics.',
    });
  }
  if (input.physical_evidence?.status === 'confirmed') {
    chips.push({
      label: 'Sensor-confirmed',
      tone: 'sensor',
      href: '#physical-evidence',
      hint: 'Public sensor networks (USGS earthquakes, NASA satellites, NOAA weather) recorded a matching event.',
    });
  } else if (input.physical_evidence?.status === 'partial') {
    chips.push({
      label: 'Partial sensor signal',
      tone: 'sensor',
      href: '#physical-evidence',
      hint: 'Public sensor networks recorded a partial match consistent with the reporting.',
    });
  } else if (input.physical_evidence?.status === 'none_detected') {
    chips.push({
      label: 'No sensor coverage',
      tone: 'neutral',
      href: '#physical-evidence',
      hint: 'Public sensor networks did not pick up matching data — that is a coverage gap, not a denial of the event.',
    });
  }
  if (input.syndicated && chips.length < 4) {
    chips.push({
      label: 'Same article republished',
      tone: 'caution',
      hint:
        'Many of the sites carrying this story appear to be running the same underlying article (often a single news-agency or press-release piece) rather than each reporting it themselves.',
    });
  }
  return chips.slice(0, 4);
}

/**
 * Plain-language "What multiple sources agree on" lines.
 * Deterministic — derived from source counts and contradiction shape,
 * never from raw evidence text.
 */
function buildWhatsSupported(input: TrustExplanationInput): string[] {
  const out: string[] = [];
  const total = input.source_count;
  if (input.syndicated) {
    // Important: do NOT call these "independent" — that's the lie the
    // user spotted. State the bare fact (X sites are carrying it) and
    // leave the corroboration verdict to the disputed/unclear sections.
    if (total >= 2) {
      out.push(`${total} sites are carrying this story.`);
    }
    out.push('The basic shape of the event (what, where, roughly when) is consistent everywhere it is reported.');
  } else if (total >= 5) {
    out.push(`${total} different newsrooms are reporting the same event independently.`);
  } else if (total >= 2) {
    out.push(`${total} sources are reporting this and they describe the event the same way.`);
  }
  if (input.physical_evidence?.status === 'confirmed') {
    out.push('Public sensor networks recorded a matching event.');
  } else if (input.physical_evidence?.status === 'partial') {
    out.push('Public sensor networks recorded a partial match consistent with the reporting.');
  }
  return out;
}

/**
 * Plain-language "Where sources disagree or evidence is missing" lines.
 */
function buildWhatsDisputed(
  input: TrustExplanationInput,
  contraTypes: string[],
): string[] {
  const out: string[] = [];
  if (input.contradictions_count > 0) {
    const kinds = [...new Set(contraTypes.map(shortConflictKind))].filter(Boolean);
    if (kinds.length > 0) {
      out.push(`Reports disagree on ${kinds.join(', ')}. The exact disagreement is listed below with citations.`);
    } else {
      out.push('Reports disagree on a material detail of this story. The exact disagreement is listed below with citations.');
    }
  }
  if (input.syndicated) {
    out.push(
      `Most of the ${input.source_count > 0 ? input.source_count + ' sites' : 'sites'} carrying this story appear to be running the same article rather than reporting it themselves. Treat the source count as smaller than it looks.`,
    );
  }
  if (input.physical_evidence?.status === 'none_detected' && input.contradictions_count === 0) {
    out.push('Public sensor networks have not picked up matching data in this window. That is a coverage gap, not a denial of the event.');
  }
  if (input.report.band === 'low' && input.source_count <= 1) {
    out.push('Only one source is reporting this so far. There is not enough other reporting to confirm any specifics yet.');
  }
  return out;
}

/**
 * Plain-language "What is still unclear / what to watch" lines.
 */
function buildWhatsUnclear(input: TrustExplanationInput): string[] {
  const out: string[] = [];
  if (input.contradictions_count > 0) {
    out.push('Whether the disputed details settle as more sources report or revise their numbers.');
  }
  if (input.syndicated) {
    out.push('Whether other newsrooms pick this up and report it independently, or whether it stays one article being republished everywhere.');
  } else if (input.report.band === 'medium' || input.report.band === 'low') {
    out.push('Whether additional newsrooms pick this up. Coverage from only one or two sources often shifts in the first hours.');
  }
  if (input.physical_evidence?.status === 'partial' || input.physical_evidence?.status === 'none_detected') {
    out.push('Whether sensor coverage improves (next satellite pass, additional readings, weather updates).');
  }
  if (out.length === 0) {
    out.push('Whether new reporting changes the basic shape of the event.');
  }
  return out;
}

/**
 * One-line suggested chat prompt. The AI workspace can pre-fill its
 * input with this; the user does not have to come up with the question.
 */
function buildSuggestedPrompt(
  input: TrustExplanationInput,
  contraTypes: string[],
): string {
  const t = (input.title ?? 'this story').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (input.contradictions_count > 0) {
    if (contraTypes.includes('cause_conflict')) {
      return `For "${t}": which sources disagree on the cause, and how strong is each side's evidence?`;
    }
    if (contraTypes.includes('numeric_conflict')) {
      return `For "${t}": which numbers are disputed, and how have they changed across sources over time?`;
    }
    return `For "${t}": where exactly do sources disagree, and which side has more independent corroboration?`;
  }
  if (input.report.band === 'low') {
    return `For "${t}": what would it take for this single-source story to be considered well-supported?`;
  }
  if (input.syndicated) {
    return `For "${t}": which sites are reporting this themselves versus just republishing the same article?`;
  }
  return `For "${t}": what is widely supported, what is disputed, and what should I watch for next?`;
}

/**
 * Internal helper for tests — exposes the safety check on a single
 * candidate string. Returns true when the string is safe to render to a
 * reader.
 */
export function isPlainTrustSafe(s: string): boolean {
  return !FORBIDDEN_TRUST_PHRASES.some((rx) => rx.test(s));
}
