/**
 * Bias detection (April 2026 upgrade — third ship of the evidence
 * comparison upgrade plan).
 *
 * Hard constraint, repeated to anyone touching this file: BIAS IS A
 * SIGNAL, NOT A VERDICT. The module never decides whether a claim is
 * "true" or "false". It surfaces *language patterns* — loaded vocabulary,
 * one-sided framing, selective omission cues, emotionally charged tone —
 * so a reader can calibrate the writing they're reading. The downstream
 * UI MUST render bias separately from the confidence band, and MUST not
 * combine bias scores into the band math.
 *
 * Output: a `BiasReport` per piece of text, plus an aggregate report at
 * the corpus level. Both are deterministic, LLM-free, and pure.
 */

export type BiasSignalType =
  | 'loaded_language'
  | 'one_sided_framing'
  | 'selective_omission'
  | 'emotional_tone';

export interface BiasSignal {
  type: BiasSignalType;
  /** 0–100. Higher = stronger signal of this category in the text. */
  intensity: number;
  /** Up to 3 short matches (lowercased) for transparency. */
  examples: string[];
  /** Plain-English description of the pattern detected. */
  description: string;
}

export interface BiasReport {
  /** 0–100 composite. NEVER fed back into the confidence engine. */
  overall_intensity: number;
  /** "neutral" | "low" | "moderate" | "strong" — for UI chip tone. */
  band: 'neutral' | 'low' | 'moderate' | 'strong';
  signals: BiasSignal[];
  /** Always non-empty — at minimum "no bias signals detected". */
  summary: string;
  /** Stable disclaimer the UI is required to render. */
  disclaimer: string;
}

/**
 * Loaded / morally-charged vocabulary.
 *
 * The lexicon is intentionally short and high-signal. Words are matched
 * as whole tokens (case-insensitive), and we cap intensity per category
 * so a single phrase doesn't dominate.
 */
const LOADED_TERMS: ReadonlyArray<RegExp> = [
  /\bregime\b/i,
  /\bpropaganda\b/i,
  /\bterrorist(?:s)?\b/i,
  /\bextremists?\b/i,
  /\bradicals?\b/i,
  /\bthugs?\b/i,
  /\bdespot(?:ic)?\b/i,
  /\btyrant(?:s)?\b/i,
  /\b(slaughter|massacre|genocide)d?\b/i,
  /\bhero(?:es|ic)?\b/i,
  /\bvillain(?:s|ous)?\b/i,
  /\bevil\b/i,
  /\bfreedom[- ]?fighters?\b/i,
  /\binvaders?\b/i,
  /\bliberat(?:or|ed|ion)\b/i,
  /\bcrush(?:ed)?\b/i,
  /\bdevastating\b/i,
  /\bcrushing\b/i,
  /\bshocking\b/i,
  /\boutrageous\b/i,
  /\bdisgrac(?:e|eful|ed)\b/i,
  /\bscandal(?:ous)?\b/i,
  /\bsmear(?:ed)?\b/i,
  /\bweaponi[sz]ed\b/i,
  /\bwitch[- ]?hunt\b/i,
];

/**
 * One-sided framing cues. We look for asymmetric attribution:
 * "according to X" without a counter-citation, "critics say" without
 * "supporters say", and similar. Each pattern is a regex executed on
 * the full text — we then check whether a counter-balancing pattern
 * also fires, and only flag when it doesn't.
 */
const ONE_SIDED_PATTERNS: ReadonlyArray<{ rx: RegExp; counter: RegExp; note: string }> = [
  {
    rx: /\b(critics|opponents|detractors)\s+(say|argue|contend|claim)\b/i,
    counter: /\b(supporters|proponents|defenders)\s+(say|argue|contend|claim)\b/i,
    note: 'Cites critics without citing supporters.',
  },
  {
    rx: /\b(supporters|proponents|defenders)\s+(say|argue|contend|claim)\b/i,
    counter: /\b(critics|opponents|detractors)\s+(say|argue|contend|claim)\b/i,
    note: 'Cites supporters without citing critics.',
  },
  {
    rx: /\b(many|most|some|several)\s+(experts|analysts|observers)\s+(say|believe|warn|argue)\b/i,
    counter: /\b(others|skeptics|critics)\s+(disagree|say|argue)\b/i,
    note: 'Appeals to "experts" without naming them or citing dissent.',
  },
  {
    rx: /\b(?:everyone|nobody|no one)\s+(?:agrees|denies|knows)\b/i,
    counter: /\b(?:disagrees|except|however|but\s+\w+\s+notes)\b/i,
    note: 'Universal claim without acknowledging dissent.',
  },
  {
    rx: /\bthe\s+real\s+(?:story|reason|truth|agenda)\b/i,
    counter: /\b(?:disputed|alternative|competing)\s+(?:account|theory|narrative)\b/i,
    note: 'Asserts a single "real story" framing.',
  },
];

/**
 * Selective-omission cues. We never know what's missing without
 * comparing against other sources, but text-level cues for *signposted*
 * omission — "did not respond", "no comment", "could not be reached" —
 * are themselves an editorial pattern worth surfacing.
 *
 * Crucially, we do NOT score "did not respond" as bias against the
 * subject. We score the act of repeatedly using it without
 * acknowledging that the subject's view is missing as a signal.
 */
const OMISSION_PATTERNS: ReadonlyArray<RegExp> = [
  /\bdid not respond\s+(?:to (?:requests? for comment|inquiries))?/i,
  /\bcould not be reached for comment\b/i,
  /\bdeclined to comment\b/i,
  /\bno (?:immediate )?comment\b/i,
  /\b(no|without)\s+(?:any\s+)?(?:evidence|proof|substantiation)\b/i,
  /\bunsubstantiated\b/i,
];

/** Strong emotional tone markers — exclamations, all-caps shouting,
 *  superlatives. Capped severity per category. */
const EMOTIONAL_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(shocking|horrifying|appalling|outrageous|devastating|terrifying|alarming)\b/i,
  /\b(amazing|incredible|unbelievable|astonishing)\b/i,
  /\b(must[- ]?see|must[- ]?read|you (?:won['’]t|wont) believe)\b/i,
  /\b(furious|enraged|livid|incensed)\b/i,
  /\b(slammed|blasted|destroyed|annihilated|eviscerated)\b/i,
  /[!]{2,}/,
];

const ALL_CAPS_RX = /\b[A-Z]{4,}\b/g;

const DISCLAIMER =
  'Bias signals describe how the text is written. They are not a judgement of whether the underlying claim is true.';

function intensityFromHits(hits: number, perHit: number, cap: number): number {
  return Math.min(cap, hits * perHit);
}

function detectLoaded(text: string): BiasSignal {
  const examples = new Set<string>();
  let hits = 0;
  for (const rx of LOADED_TERMS) {
    rx.lastIndex = 0;
    const m = text.match(rx);
    if (m) {
      hits += 1;
      examples.add(m[0].toLowerCase());
    }
    if (examples.size >= 3) break;
  }
  const intensity = intensityFromHits(hits, 18, 90);
  return {
    type: 'loaded_language',
    intensity,
    examples: [...examples].slice(0, 3),
    description:
      hits > 0
        ? 'Vocabulary that pre-judges the actors involved (e.g. "regime", "extremist", "hero").'
        : 'No notably loaded vocabulary detected in the text.',
  };
}

function detectOneSided(text: string): BiasSignal {
  const examples = new Set<string>();
  let hits = 0;
  for (const p of ONE_SIDED_PATTERNS) {
    p.rx.lastIndex = 0;
    p.counter.lastIndex = 0;
    if (p.rx.test(text) && !p.counter.test(text)) {
      hits += 1;
      examples.add(p.note);
    }
    if (examples.size >= 3) break;
  }
  const intensity = intensityFromHits(hits, 25, 90);
  return {
    type: 'one_sided_framing',
    intensity,
    examples: [...examples].slice(0, 3),
    description:
      hits > 0
        ? 'Quotes one side of a dispute without quoting or naming the other.'
        : 'Framing references both sides, or no framing markers were detected.',
  };
}

function detectOmission(text: string): BiasSignal {
  const examples = new Set<string>();
  let hits = 0;
  for (const rx of OMISSION_PATTERNS) {
    rx.lastIndex = 0;
    const m = text.match(rx);
    if (m) {
      hits += 1;
      examples.add(m[0].toLowerCase());
    }
    if (examples.size >= 3) break;
  }
  const intensity = intensityFromHits(hits, 20, 80);
  return {
    type: 'selective_omission',
    intensity,
    examples: [...examples].slice(0, 3),
    description:
      hits > 0
        ? 'Signals that one party\u2019s account or evidence is absent ("did not respond", "unsubstantiated").'
        : 'No explicit omission cues detected.',
  };
}

function detectEmotional(text: string): BiasSignal {
  const examples = new Set<string>();
  let hits = 0;
  for (const rx of EMOTIONAL_PATTERNS) {
    rx.lastIndex = 0;
    const m = text.match(rx);
    if (m) {
      hits += 1;
      examples.add(m[0].toLowerCase());
    }
    if (examples.size >= 3) break;
  }
  // ALL CAPS shouting (4+ chars in a row, used multiple times) is a
  // separate emotional signal worth tracking.
  const allCapsHits = (text.match(ALL_CAPS_RX) ?? []).filter((m) => m !== m.toLowerCase()).length;
  if (allCapsHits >= 3) {
    hits += 1;
    examples.add(`${allCapsHits} all-caps tokens`);
  }
  const intensity = intensityFromHits(hits, 18, 80);
  return {
    type: 'emotional_tone',
    intensity,
    examples: [...examples].slice(0, 3),
    description:
      hits > 0
        ? 'Charged adjectives, exclamations, or shouting style ("shocking", "must-read", ALL CAPS).'
        : 'Tone is largely neutral / observational.',
  };
}

function bandFromOverall(intensity: number): BiasReport['band'] {
  if (intensity >= 60) return 'strong';
  if (intensity >= 35) return 'moderate';
  if (intensity >= 15) return 'low';
  return 'neutral';
}

function buildSummary(signals: BiasSignal[], band: BiasReport['band']): string {
  const named = signals.filter((s) => s.intensity > 0);
  if (named.length === 0) {
    return 'No noticeable bias markers in the text — the language reads as broadly observational.';
  }
  const labels = named
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 2)
    .map((s) => prettyLabel(s.type));
  const intro =
    band === 'strong'
      ? 'Strong bias markers'
      : band === 'moderate'
        ? 'Moderate bias markers'
        : 'Mild bias markers';
  return `${intro} detected — ${labels.join(' and ')}. Treat this as a reading-comprehension cue, not a fact-check.`;
}

function prettyLabel(t: BiasSignalType): string {
  switch (t) {
    case 'loaded_language':
      return 'loaded vocabulary';
    case 'one_sided_framing':
      return 'one-sided framing';
    case 'selective_omission':
      return 'selective omission cues';
    case 'emotional_tone':
      return 'emotionally charged tone';
  }
}

/**
 * Detect bias markers in a single piece of text.
 *
 * Empty / very short input gets a `neutral` report (we don't pretend to
 * judge a sentence fragment). All four signals are always present in
 * the output so consumers can render them with stable shapes.
 */
export function detectBias(text: string | null | undefined): BiasReport {
  const cleaned = (text ?? '').trim();
  if (cleaned.length < 20) {
    const empty: BiasReport = {
      overall_intensity: 0,
      band: 'neutral',
      signals: [
        { type: 'loaded_language', intensity: 0, examples: [], description: 'Not enough text to evaluate.' },
        { type: 'one_sided_framing', intensity: 0, examples: [], description: 'Not enough text to evaluate.' },
        { type: 'selective_omission', intensity: 0, examples: [], description: 'Not enough text to evaluate.' },
        { type: 'emotional_tone', intensity: 0, examples: [], description: 'Not enough text to evaluate.' },
      ],
      summary: 'Not enough text supplied to detect bias markers reliably.',
      disclaimer: DISCLAIMER,
    };
    return empty;
  }
  const loaded = detectLoaded(cleaned);
  const oneSided = detectOneSided(cleaned);
  const omission = detectOmission(cleaned);
  const emotional = detectEmotional(cleaned);
  const signals: BiasSignal[] = [loaded, oneSided, omission, emotional];

  // Composite — weighted average tilted toward loaded language and
  // one-sided framing, since those are the ones that most affect the
  // reader's calibration of the report.
  const overall = Math.round(
    loaded.intensity * 0.32 +
      oneSided.intensity * 0.28 +
      omission.intensity * 0.18 +
      emotional.intensity * 0.22,
  );
  const band = bandFromOverall(overall);
  return {
    overall_intensity: overall,
    band,
    signals,
    summary: buildSummary(signals, band),
    disclaimer: DISCLAIMER,
  };
}

/**
 * Aggregate bias across multiple pieces of text (e.g. the merged
 * evidence corpus). Returns the *average* of per-piece reports so a
 * single shouty headline doesn't blow up the corpus-level rating.
 */
export interface CorpusBiasReport {
  pieces: number;
  /** Weighted-average intensity across pieces. */
  avg_intensity: number;
  band: BiasReport['band'];
  /** Per-category averages, useful for ‘bias spotlight’ chips. */
  per_signal: Record<BiasSignalType, number>;
  /** True when the average exceeds the moderate threshold. */
  has_signal: boolean;
  summary: string;
  disclaimer: string;
}

export function detectCorpusBias(texts: Array<string | null | undefined>): CorpusBiasReport {
  const reports = texts
    .map((t) => detectBias(t))
    .filter((r) => r.overall_intensity > 0 || r.signals.some((s) => s.intensity > 0));
  if (reports.length === 0) {
    return {
      pieces: 0,
      avg_intensity: 0,
      band: 'neutral',
      per_signal: {
        loaded_language: 0,
        one_sided_framing: 0,
        selective_omission: 0,
        emotional_tone: 0,
      },
      has_signal: false,
      summary: 'No evidence text supplied to evaluate corpus bias.',
      disclaimer: DISCLAIMER,
    };
  }
  const totals: Record<BiasSignalType, number> = {
    loaded_language: 0,
    one_sided_framing: 0,
    selective_omission: 0,
    emotional_tone: 0,
  };
  let overallSum = 0;
  for (const r of reports) {
    overallSum += r.overall_intensity;
    for (const s of r.signals) totals[s.type] += s.intensity;
  }
  const avg = Math.round(overallSum / reports.length);
  const per: Record<BiasSignalType, number> = {
    loaded_language: Math.round(totals.loaded_language / reports.length),
    one_sided_framing: Math.round(totals.one_sided_framing / reports.length),
    selective_omission: Math.round(totals.selective_omission / reports.length),
    emotional_tone: Math.round(totals.emotional_tone / reports.length),
  };
  const band = bandFromOverall(avg);
  const hasSignal = avg >= 25;
  const top = (Object.entries(per) as Array<[BiasSignalType, number]>)
    .sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v > 10)
    .slice(0, 2)
    .map(([k]) => prettyLabel(k));
  const summary = hasSignal
    ? `Across ${reports.length} text${reports.length === 1 ? '' : 's'}, the dominant bias markers are ${top.join(' and ') || 'mild'}. Read the underlying sources directly.`
    : `Across ${reports.length} text${reports.length === 1 ? '' : 's'}, no strong bias markers stood out — language reads as broadly observational.`;
  return {
    pieces: reports.length,
    avg_intensity: avg,
    band,
    per_signal: per,
    has_signal: hasSignal,
    summary,
    disclaimer: DISCLAIMER,
  };
}

/** Stable disclaimer string for the UI. Always render. */
export const BIAS_DISCLAIMER = DISCLAIMER;
