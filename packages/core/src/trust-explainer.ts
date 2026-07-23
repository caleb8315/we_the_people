/**
 * Plain-language trust explainer (AI trust platform plan, capability 2).
 *
 * Goal: every user-facing surface (feed card, signal page, briefing,
 * verify hero) shares one deterministic explanation generator that:
 *
 *   1. Speaks like a sharp friend who read everything — clear and human.
 *   2. Calls it when evidence is strong ("this looks trustworthy") and
 *      says so plainly when things are thin or disputed.
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

export type TrustEvidenceState =
  | 'confirmed'
  | 'multi_source'
  | 'single_source'
  | 'disputed'
  | 'missing_evidence';

export interface TrustBriefPoint {
  text: string;
  state: TrustEvidenceState;
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
  /** Reader-first brief fields used by story and briefing surfaces. */
  reader_summary: string;
  why_it_matters: string[];
  confirmed_points: TrustBriefPoint[];
  disputed_or_uncertain_points: TrustBriefPoint[];
  watch_next_points: TrustBriefPoint[];
  source_note: string;
  source_confidence: {
    label: string;
    detail: string;
    level: 'high' | 'medium' | 'low' | 'contested';
  };
}

/**
 * Safety floor only — keep people safe, don't mute clear language.
 *
 * We deliberately allow decisive wording ("trustworthy", "true",
 * "false", "debunked") when the evidence shape supports it. The only
 * bans left are personal accusation and invented motive certainty.
 */
export const FORBIDDEN_TRUST_PHRASES: readonly RegExp[] = [
  /\bthis side is lying\b/i,
  /\b(confirmed|definitive|proven)\s+motive\b/i,
  /\bAI verified\b/i,
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

  // Defensive guard: strip any string that contains a forbidden phrase.
  const safeSummary = stripIfForbidden(summary) ?? FALLBACK_SUMMARY;
  const safeWhy = why.map(stripIfForbidden).filter(isString);
  const readerBrief = buildReaderBrief(input, safeSummary, contraTypes);

  return {
    summary: safeSummary,
    why_bullets: safeWhy.slice(0, 3),
    watch_for: watch ? stripIfForbidden(watch) : null,
    learn_more: learnMore,
    headline_chips: chips,
    whats_supported: supported.slice(0, 3),
    whats_disputed: disputed.slice(0, 3),
    whats_unclear: unclear.slice(0, 3),
    suggested_prompt: prompt,
    reader_summary: readerBrief.summary,
    why_it_matters: readerBrief.whyItMatters.slice(0, 3),
    confirmed_points: readerBrief.confirmed.slice(0, 4),
    disputed_or_uncertain_points: readerBrief.disputedOrUncertain.slice(0, 4),
    watch_next_points: readerBrief.watchNext.slice(0, 4),
    source_note: readerBrief.sourceNote,
    source_confidence: readerBrief.sourceConfidence,
  };
}

const FALLBACK_SUMMARY =
  'Still early — open the sources and decide for yourself.';

function storySubject(title: string | undefined): string {
  const t = (title ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return 'this story';
  return `"${t.slice(0, 140)}"`;
}

function buildSummary(input: TrustExplanationInput): string {
  const { report, contradictions_count: cc } = input;
  const subject = storySubject(input.title);
  if (cc > 0) {
    return `${subject} has conflicting details across sources. We flagged the exact disagreements below.`;
  }
  switch (report.band) {
    case 'high':
      if (input.syndicated) {
        return `${subject} is everywhere online, but a lot of that is the same article copied around. Treat the crowd size as smaller than it looks.`;
      }
      return input.source_count >= 4
        ? `${subject} looks trustworthy — ${input.source_count} different newsrooms match on the core facts.`
        : `${subject} looks solid — multiple newsrooms agree on what happened.`;
    case 'medium':
      if (input.syndicated) {
        return `${subject} has broad pickup, but much of it looks like republished copy rather than fresh reporting.`;
      }
      return `${subject} looks real, but it's still forming. Core facts are in; some specifics can still move.`;
    case 'low':
      if (input.source_count <= 1) {
        return `${subject} is still single-source. Interesting, but don't bet the farm on the details yet.`;
      }
      return `${subject} has ${input.source_count} mentions, but independent confirmation is still thin.`;
    case 'contested':
      return `${subject} has conflicting details across sources. We flagged the exact disagreements below.`;
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
        `${input.source_count} different newsrooms are on this — strong corroboration when each one is reporting independently.`,
      );
    } else if (input.source_count >= 3) {
      out.push(
        `${input.source_count} sources are reporting this and the core event description lines up.`,
      );
    } else if (input.source_count === 2) {
      out.push('Two sources are reporting this so far. Helpful, but still early.');
    } else {
      out.push('Only one source so far — too early to call this settled.');
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
      return 'Cause and motive are still fought over — skip posts that treat that part as settled.';
    }
    if (contraTypes.includes('numeric_conflict')) {
      return 'Numbers (casualty counts, magnitudes, totals) are still moving. Wait a beat before sharing specifics.';
    }
    return 'Hold the specifics until the disagreement settles.';
  }
  if (input.report.band === 'low' && input.source_count <= 1) {
    return 'Single-source stories swing hard in the first hours. Wait for a second newsroom before trusting the detail.';
  }
  if (input.syndicated) {
    return 'A big source count can fool you here — most sites are running the same article, not independently confirming it.';
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
  const subject = storySubject(input.title);
  if (input.syndicated) {
    // Important: do NOT call these "independent" — that's the lie the
    // user spotted. State the bare fact (X sites are carrying it) and
    // leave the corroboration verdict to the disputed/unclear sections.
    if (total >= 2) {
      out.push(`${subject} is being carried by ${total} sites.`);
    }
    out.push(`Across coverage of ${subject}, the basic event shape (what/where/roughly when) is consistent.`);
  } else if (total >= 5) {
    out.push(`${subject} is reported independently by ${total} different newsrooms.`);
  } else if (total >= 2) {
    out.push(`${subject} is reported by ${total} sources with matching core details.`);
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
  const subject = storySubject(input.title);
  if (input.contradictions_count > 0) {
    const kinds = [...new Set(contraTypes.map(shortConflictKind))].filter(Boolean);
    if (kinds.length > 0) {
      out.push(`For ${subject}, reports disagree on ${kinds.join(', ')}. The exact disagreement is listed below with citations.`);
    } else {
      out.push(`For ${subject}, reports disagree on a material detail. The exact disagreement is listed below with citations.`);
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
  const subject = storySubject(input.title);
  if (input.contradictions_count > 0) {
    out.push(`Whether disputed details in ${subject} settle as more outlets publish updates or revise numbers.`);
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

function buildReaderBrief(
  input: TrustExplanationInput,
  safeSummary: string,
  contraTypes: string[],
): {
  summary: string;
  whyItMatters: string[];
  confirmed: TrustBriefPoint[];
  disputedOrUncertain: TrustBriefPoint[];
  watchNext: TrustBriefPoint[];
  sourceNote: string;
  sourceConfidence: {
    label: string;
    detail: string;
    level: 'high' | 'medium' | 'low' | 'contested';
  };
} {
  const whyItMatters = buildWhyItMatters(input);
  const confirmed = buildConfirmedPoints(input);
  const disputedOrUncertain = buildDisputedOrUncertainPoints(input, contraTypes);
  const watchNext = buildWatchNextPoints(input, contraTypes);
  const sourceNote = buildSourceNote(input);

  const sourceConfidence =
    input.report.band === 'high'
      ? {
          label: 'Looks trustworthy',
          detail: 'Multiple independent reports align on the core event.',
          level: 'high' as const,
        }
      : input.report.band === 'medium'
        ? {
            label: 'Still forming',
            detail: 'Some corroboration exists, but key details can still move.',
            level: 'medium' as const,
          }
        : input.report.band === 'contested'
          ? {
              label: 'Sources clash',
              detail: 'Outlets disagree on important details. Check both sides below.',
              level: 'contested' as const,
            }
          : {
              label: 'Thin so far',
              detail: 'Coverage is light or mostly single-source right now.',
              level: 'low' as const,
            };

  return {
    summary: safeSummary,
    whyItMatters,
    confirmed,
    disputedOrUncertain,
    watchNext,
    sourceNote,
    sourceConfidence,
  };
}

function buildWhyItMatters(input: TrustExplanationInput): string[] {
  const out: string[] = [];
  if (input.contradictions_count > 0) {
    out.push(
      'Important decisions can change when key details are disputed across sources.',
    );
  } else if (input.report.band === 'high') {
    out.push('Independent coverage lines up, so this one is less likely to flip overnight.');
  } else {
    out.push('Coverage is still developing — the picture can change fast as new evidence lands.');
  }

  if (input.syndicated) {
    out.push('A high outlet count can be misleading when many sites republish one original article.');
  }

  if (input.physical_evidence?.status === 'none_detected') {
    out.push('No matching sensor record has been found yet, which leaves an evidence gap.');
  } else if (input.physical_evidence?.status === 'partial') {
    out.push('Sensor data supports part of the story, but not the full picture yet.');
  }

  if (out.length === 0) {
    out.push('This story is tracked because its reporting consistency and evidence depth are changing.');
  }
  return out.map((line) => safeOrNull(line)).filter(isString);
}

function buildConfirmedPoints(input: TrustExplanationInput): TrustBriefPoint[] {
  const out: TrustBriefPoint[] = [];
  if (input.source_count >= 2 && !input.syndicated && input.contradictions_count === 0) {
    out.push({
      text: `${input.source_count} sources report the same core event description.`,
      state: 'multi_source',
    });
  } else if (input.credible_source_count >= 2) {
    // Multiple independent credible outlets are reporting, but syndication or a
    // detail-level disagreement kept us out of the "same core description"
    // branch above. The event's occurrence is still corroborated even when the
    // specifics are disputed — surface that as the confirmed baseline.
    out.push({
      text: `${input.credible_source_count} independent credible sources report that the event occurred, even if some details are still disputed.`,
      state: 'multi_source',
    });
  }
  if (input.physical_evidence?.status === 'confirmed') {
    out.push({
      text: 'Public sensor networks recorded a matching event.',
      state: 'confirmed',
    });
  } else if (input.physical_evidence?.status === 'partial') {
    out.push({
      text: 'Sensor data partially matches the reporting.',
      state: 'confirmed',
    });
  }
  if (out.length === 0 && input.source_count === 1 && input.contradictions_count === 0) {
    out.push({
      text: 'At least one source is currently reporting this event.',
      state: 'single_source',
    });
  }
  return out.map((row) => ({ ...row, text: safeOrNull(row.text) ?? row.text }));
}

function buildDisputedOrUncertainPoints(
  input: TrustExplanationInput,
  contraTypes: string[],
): TrustBriefPoint[] {
  const out: TrustBriefPoint[] = [];
  if (input.contradictions_count > 0) {
    const kinds = [...new Set(contraTypes.map(shortConflictKind))].filter(Boolean);
    out.push({
      text:
        kinds.length > 0
          ? `Sources disagree on ${kinds.join(', ')}.`
          : 'Sources disagree on a material detail.',
      state: 'disputed',
    });
  }
  if (input.source_count <= 1) {
    out.push({
      text: 'The story is still single-source, so specifics may change.',
      state: 'single_source',
    });
  }
  if (input.syndicated) {
    out.push({
      text: 'Many outlets appear to carry the same original article, so independent confirmation is limited.',
      state: 'missing_evidence',
    });
  }
  if (input.physical_evidence?.status === 'none_detected') {
    out.push({
      text: 'No matching public sensor signal has been detected in this window.',
      state: 'missing_evidence',
    });
  }
  if (out.length === 0) {
    out.push({
      text: 'Some details remain uncertain while corroboration is still developing.',
      state: 'missing_evidence',
    });
  }
  return out.map((row) => ({ ...row, text: safeOrNull(row.text) ?? row.text }));
}

function buildWatchNextPoints(
  input: TrustExplanationInput,
  contraTypes: string[],
): TrustBriefPoint[] {
  const out: TrustBriefPoint[] = [];
  if (contraTypes.includes('numeric_conflict')) {
    out.push({
      text: 'Watch for updated numbers from independent outlets and official updates.',
      state: 'disputed',
    });
  }
  if (contraTypes.includes('cause_conflict')) {
    out.push({
      text: 'Watch for direct evidence that clarifies cause or attribution.',
      state: 'disputed',
    });
  }
  if (input.syndicated) {
    out.push({
      text: 'Watch for original reporting from additional newsrooms beyond republished copies.',
      state: 'missing_evidence',
    });
  } else if (input.source_count <= 2) {
    out.push({
      text: 'Watch for additional independent sources confirming the same details.',
      state: input.source_count <= 1 ? 'single_source' : 'multi_source',
    });
  }
  if (input.physical_evidence?.status !== 'confirmed') {
    out.push({
      text: 'Watch for new sensor or official evidence that narrows current gaps.',
      state: 'missing_evidence',
    });
  }
  if (out.length === 0) {
    out.push({
      text: 'Watch for any shift in source agreement as new reporting arrives.',
      state: 'confirmed',
    });
  }
  return out.map((row) => ({ ...row, text: safeOrNull(row.text) ?? row.text }));
}

function buildSourceNote(input: TrustExplanationInput): string {
  const subject = storySubject(input.title);
  const sourceShape = input.syndicated
    ? `${subject} appears across ${input.source_count} sites, but many republish the same original article.`
    : `${subject} has ${input.source_count} sources in this cluster, including ${input.credible_source_count} rated outlets.`;
  const evidenceChecked =
    input.physical_evidence?.status === 'confirmed'
      ? 'Checked: outlet agreement, contradiction scan, and matching sensor evidence.'
      : input.physical_evidence?.status === 'partial'
        ? 'Checked: outlet agreement, contradiction scan, and partial sensor evidence.'
        : 'Checked: outlet agreement, contradiction scan, and available sensor coverage.';
  return `${sourceShape} ${evidenceChecked}`;
}
