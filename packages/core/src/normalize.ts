/**
 * Cross-source normalization for the contradiction detector.
 *
 * Different outlets describe the same underlying cause with different words.
 * Without mapping them to a small, canonical category space our detector
 * produces false positives — e.g. "airstrike" vs "bombing" looks like
 * disagreement, but both are `military_strike`. This module is the single
 * source of truth for canonicalization; every comparison in
 * `detectInconsistencies` goes through it.
 *
 * Rules:
 *   - Keep the canonical set small and stable (schema-like).
 *   - Prefer `unknown` to a wrong guess. "Explosion" alone is ambiguous
 *     (could be industrial accident, kinetic strike, gas leak, etc.) so
 *     it resolves to `unknown` and does NOT contribute to a cause conflict.
 *   - No accusations. These labels describe how the event is **being
 *     reported** — they are not factual findings.
 */

export type CanonicalCause =
  | 'military_strike'
  | 'accident'
  | 'natural_disaster'
  | 'cyber_incident'
  | 'disease_outbreak'
  | 'civil_unrest'
  | 'unknown';

// Ordered so the first match wins. Kept as module-level constants so regexes
// are compiled once.

const MILITARY_STRIKE_RX =
  /\b(air[- ]?strike|air[- ]?raid|bomb(?:ing|ed|s|er)?|missile|rocket\s*(?:attack|strike|launch)?|artiller(?:y|ies)|shell(?:ing|ed)|drone[- ]?(?:strike|attack)|military\s*strike|offensive|invasion|kinetic\s*strike|gunfire|open(?:ed)?\s*fire)\b/i;

const NATURAL_DISASTER_RX =
  /\b(earthquake|aftershock|tsunami|volcano|eruption|wildfire|bushfire|flood(?:ing)?|hurricane|cyclone|typhoon|tornado|landslide|mudslide|avalanche|drought|heatwave|heat\s*dome)\b/i;

const CYBER_RX =
  /\b(cyber[- ]?attack|ransomware|data\s*breach|\bbreach(?:ed|es)?\b|ddos|malware|phishing|(?:zero|0)[- ]?day|exploit(?:ation)?|hack(?:ing|ed|ers?)?|intrusion)\b/i;

const DISEASE_RX =
  /\b(outbreak|epidemic|pandemic|infection\s*cluster|cluster\s*of\s*cases|h\d?n\d|covid|cholera|ebola)\b/i;

const UNREST_RX =
  /\b(protest(?:er|ers|ing)?|rally|demonstration|riot(?:ing|er|ers)?|unrest|uprising|march(?:ing|es)?|strike\s*action|sit[- ]?in)\b/i;

const ACCIDENT_RX =
  /\b(accident(?:al)?|malfunction|misfire|unintentional|friendly\s*fire|technical\s*failure|equipment\s*failure)\b/i;

// Deliberately AMBIGUOUS terms — they should NOT pick a camp by themselves.
const AMBIGUOUS_RX =
  /\b(explosion|exploded|blast|fire|fires|incident|crash(?:ed)?)\b/i;

/**
 * Map any free-text description to a canonical cause. Always falls back to
 * `unknown` when the input is missing or only matches ambiguous vocabulary.
 *
 * Order of evaluation is intentional: specific categories first, the
 * ambiguous bucket LAST so that e.g. "military strike caused explosion"
 * resolves to `military_strike`, not `unknown`.
 */
export function normalizeCause(raw: string | null | undefined): CanonicalCause {
  if (!raw) return 'unknown';
  const text = raw;
  if (MILITARY_STRIKE_RX.test(text)) return 'military_strike';
  if (NATURAL_DISASTER_RX.test(text)) return 'natural_disaster';
  if (CYBER_RX.test(text)) return 'cyber_incident';
  if (DISEASE_RX.test(text)) return 'disease_outbreak';
  if (UNREST_RX.test(text)) return 'civil_unrest';
  if (ACCIDENT_RX.test(text)) return 'accident';
  if (AMBIGUOUS_RX.test(text)) return 'unknown';
  return 'unknown';
}

/** Human-readable form of a canonical cause, for UI / summaries. */
export function canonicalCauseLabel(c: CanonicalCause): string {
  switch (c) {
    case 'military_strike':
      return 'military strike';
    case 'accident':
      return 'accident';
    case 'natural_disaster':
      return 'natural disaster';
    case 'cyber_incident':
      return 'cyber incident';
    case 'disease_outbreak':
      return 'disease outbreak';
    case 'civil_unrest':
      return 'civil unrest';
    case 'unknown':
      return 'unspecified';
  }
}
