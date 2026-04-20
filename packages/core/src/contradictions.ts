import type { Contradiction, EvidenceItem } from './types';
import { canonicalCauseLabel, normalizeCause, type CanonicalCause } from './normalize';

/**
 * Source-disagreement detector.
 *
 * Philosophy: we surface *inconsistencies* between public reports — we never
 * accuse and we never claim truth. The detector emits one or more typed,
 * severity-banded disagreements with a short human summary and a structured
 * metadata payload. The ingest pipeline writes these atomically with the
 * parent signal and evidence rows (delete-then-insert per signal_id).
 *
 * Required contract (enforced by the DB in migration 014):
 *   type:     'cause_conflict' | 'numeric_conflict' | 'presence_conflict'
 *   severity: 'low' | 'medium' | 'high'
 *   summary:  string
 *   metadata: jsonb (structured per-type payload)
 *   evidence_ids: uuid[]
 *
 * ── Performance contract (phase 7) ────────────────────────────────────────
 * `detectInconsistencies(claims)` is O(n) in the number of claims.
 *   - the numeric / presence branches use a single .find each → O(n)
 *   - the cause branch builds a Map keyed by the 7-member CanonicalCause
 *     enum → O(n) to fill, O(1) to compare
 *   - the attribution fallback performs one .find with a bounded .some
 *     over each claim's attribution array (typically ≤ 3 phrases) → O(n)
 * There is no nested iteration over `claims`. If you add a new rule here,
 * keep it O(n) — never loop over claims inside another loop over claims.
 *
 * Hard limits live in MAX_SOURCES_PER_SIGNAL and MAX_CLAIMS_PER_SIGNAL
 * below and are enforced by `detectInconsistenciesWithLimits`. The ingest
 * pipeline MUST call that wrapper, not `detectInconsistencies` directly,
 * so a pathological 200-source signal never blocks the worker.
 *
 * No LLM calls anywhere in this module. Detection is purely deterministic.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type ContradictionType =
  | 'cause_conflict'
  | 'numeric_conflict'
  | 'presence_conflict';

export type ContradictionSeverity = 'low' | 'medium' | 'high';

/**
 * A claim is the normalized, machine-readable shape of what one evidence row
 * is saying about the event: its numeric references, the assertions it
 * carries (ceasefire / kinetic / accident / attack), and any attribution
 * phrases we could extract.
 */
export interface Claim {
  evidence_id: string | null;
  source: string;
  url: string;
  text: string;
  numbers: number[];
  ceasefire: boolean;
  kinetic: boolean;
  accident: boolean;
  attack: boolean;
  attribution: string[];
  /**
   * Canonical category for the event's cause (from `normalizeCause`).
   * MUST be used for cause-conflict comparisons — never compare raw strings
   * between sources, or "airstrike" vs "bombing" will register as a
   * conflict when they describe the same `military_strike`.
   */
  canonical_cause: CanonicalCause;
}

export interface DetectedContradiction {
  type: ContradictionType;
  severity: ContradictionSeverity;
  summary: string;
  metadata: Record<string, unknown>;
  evidence_ids: string[];
}

// ── Lexicon ────────────────────────────────────────────────────────────────

const CEASEFIRE_RX = /\b(ceasefire|cease[- ]fire|truce|stand[- ]?down|halt(ed|s)? (the |all )?fighting)\b/i;
const KINETIC_RX =
  /\b(airstrike|shelling|shelled|missile|artillery|gunfire|casualt|fatalit|killed|wound(ed|s)?|bomb(ing|ed)?|explosion|exploded|strike(s)?|drone[- ]?strike)\b/i;
const ACCIDENT_RX =
  /\b(accident(al)?|malfunction|misfire|unintentional|technical\s*failure|friendly\s*fire)\b/i;
const ATTACK_RX =
  /\b(deliberate|intentional|target(ed)?|premeditat|direct\s*attack|carried\s*out|launch(ed)?\s*(an?\s*)?(attack|strike))\b/i;
// "blamed X" / "attributed to X" / "responsible for" / "behind the attack"
const ATTRIBUTION_RX =
  /\b(?:blam(?:ed|es)|attribut(?:ed|es)\s*(?:to|it\s*to)|behind\s*the|responsible\s*for|claim(?:ed|s)\s*by|caused\s*by)\s+([A-Z][\w .'-]{2,48})/g;

// ── Extraction ─────────────────────────────────────────────────────────────

function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const rx = /\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const raw = m[1]!.replace(/,/g, '');
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n < 10_000_000) out.push(n);
  }
  return out;
}

function extractAttribution(text: string): string[] {
  const out = new Set<string>();
  ATTRIBUTION_RX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTRIBUTION_RX.exec(text)) !== null) {
    const phrase = (m[1] ?? '').trim().replace(/[.,;:'"]+$/g, '').toLowerCase();
    if (phrase.length >= 3 && phrase.length <= 48) out.add(phrase);
  }
  return [...out];
}

/**
 * Turn raw evidence rows into typed claims. Evidence rows may optionally
 * carry the DB row id so the resulting contradictions can reference specific
 * evidence rows via `evidence_ids`.
 */
export function extractClaimsFromEvidence(
  evidence: Array<EvidenceItem & { id?: string | null }>,
): Claim[] {
  return evidence.map((e) => {
    const text = `${e.title ?? ''} ${e.excerpt ?? ''}`.trim();
    return {
      evidence_id: e.id ?? null,
      source: e.domain,
      url: e.url,
      text,
      numbers: extractNumbers(text),
      ceasefire: CEASEFIRE_RX.test(text),
      kinetic: KINETIC_RX.test(text),
      accident: ACCIDENT_RX.test(text),
      attack: ATTACK_RX.test(text),
      attribution: extractAttribution(text),
      // Phase 6: normalize the free-text cause into a canonical category.
      // All cross-source comparisons in `detectInconsistencies` use this
      // value, never the raw text or the accident/attack boolean flags.
      canonical_cause: normalizeCause(text),
    };
  });
}

// ── Detection ──────────────────────────────────────────────────────────────

function materialRatio(a: number, b: number): number {
  if (a === b) return 1;
  if (a === 0 || b === 0) return Number.POSITIVE_INFINITY;
  return a > b ? a / b : b / a;
}

function numericSeverity(ratio: number): ContradictionSeverity {
  if (!Number.isFinite(ratio) || ratio >= 3) return 'high';
  if (ratio >= 1.5) return 'medium';
  return 'low';
}

function pickEvidenceIds(...claims: Array<Pick<Claim, 'evidence_id'>>): string[] {
  return claims
    .map((c) => c.evidence_id)
    .filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/**
 * Deterministic, LLM-free inconsistency detection.
 *
 * Input: claims extracted from evidence (one per evidence row).
 * Output: zero or more typed contradictions, each already shaped to match
 *         the DB contract (`type`, `severity`, `summary`, `metadata`,
 *         `evidence_ids`).
 */
export function detectInconsistencies(claims: Claim[]): DetectedContradiction[] {
  const out: DetectedContradiction[] = [];
  if (claims.length < 2) return out;

  // 1) numeric_conflict — same event, materially different headline numbers.
  const withNums = claims.filter((c) => c.numbers.length > 0);
  if (withNums.length >= 2) {
    const a = withNums[0]!;
    const aN = a.numbers[0]!;
    const b = withNums.find((c) => {
      if (c === a || c.numbers[0] === undefined) return false;
      return materialRatio(aN, c.numbers[0]) >= 1.5;
    });
    if (b) {
      const bN = b.numbers[0]!;
      const ratio = materialRatio(aN, bN);
      out.push({
        type: 'numeric_conflict',
        severity: numericSeverity(ratio),
        summary: `${a.source} reports ~${aN}; ${b.source} reports ~${bN}.`,
        metadata: {
          a: { source: a.source, url: a.url, value: aN },
          b: { source: b.source, url: b.url, value: bN },
          ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : null,
        },
        evidence_ids: pickEvidenceIds(a, b),
      });
    }
  }

  // 2) presence_conflict — ceasefire/truce claimed alongside active kinetic
  //    reporting. "One source asserts X is not happening; another describes X."
  const ceasefireClaim = claims.find((c) => c.ceasefire);
  const kineticClaim = claims.find((c) => c.kinetic && !c.ceasefire);
  if (ceasefireClaim && kineticClaim) {
    out.push({
      type: 'presence_conflict',
      severity: 'high',
      summary: `${ceasefireClaim.source} references a ceasefire/truce; ${kineticClaim.source} describes ongoing kinetic activity.`,
      metadata: {
        assertion: {
          source: ceasefireClaim.source,
          url: ceasefireClaim.url,
          kind: 'ceasefire',
        },
        observation: {
          source: kineticClaim.source,
          url: kineticClaim.url,
          kind: 'kinetic_activity',
        },
      },
      evidence_ids: pickEvidenceIds(ceasefireClaim, kineticClaim),
    });
  }

  // 3) cause_conflict — PRIMARY: compare canonical causes across sources.
  //    Normalization (Phase 6) is what keeps us out of the false-positive
  //    trap where "airstrike" and "bombing" were flagged as disagreeing
  //    when both map to `military_strike`. `unknown` never participates.
  const byCause = new Map<CanonicalCause, Claim[]>();
  for (const c of claims) {
    if (c.canonical_cause === 'unknown') continue;
    const bucket = byCause.get(c.canonical_cause) ?? [];
    bucket.push(c);
    byCause.set(c.canonical_cause, bucket);
  }
  const sizedCauses = [...byCause.entries()].sort((a, b) => b[1].length - a[1].length);
  let causeConflictEmitted = false;
  if (sizedCauses.length >= 2) {
    const [topCause, topClaims] = sizedCauses[0]!;
    const [rivalCause, rivalClaims] = sizedCauses[1]!;
    const a = topClaims[0]!;
    const b = rivalClaims[0]!;
    out.push({
      type: 'cause_conflict',
      severity: 'medium',
      summary: `${a.source} describes a ${canonicalCauseLabel(topCause)}; ${b.source} describes a ${canonicalCauseLabel(rivalCause)}.`,
      metadata: {
        a: {
          source: a.source,
          url: a.url,
          frame: topCause,
          canonical_cause: topCause,
          supporting_sources: topClaims.length,
        },
        b: {
          source: b.source,
          url: b.url,
          frame: rivalCause,
          canonical_cause: rivalCause,
          supporting_sources: rivalClaims.length,
        },
      },
      evidence_ids: pickEvidenceIds(a, b),
    });
    causeConflictEmitted = true;
  }

  // 3b) cause_conflict FALLBACK — different parties named in attribution
  //    phrases (e.g. "blamed X" vs "attributed to Y"). Only emitted if the
  //    canonical-cause check didn't already fire, to avoid stacking two
  //    cause conflicts on the same signal.
  if (!causeConflictEmitted) {
    const withAttribution = claims.filter((c) => c.attribution.length > 0);
    if (withAttribution.length >= 2) {
      const a = withAttribution[0]!;
      const b = withAttribution.find(
        (c) => c !== a && !c.attribution.some((p) => a.attribution.includes(p)),
      );
      if (a && b) {
        out.push({
          type: 'cause_conflict',
          severity: 'medium',
          summary: `${a.source} attributes the event to "${a.attribution[0]}"; ${b.source} attributes it to "${b.attribution[0]}".`,
          metadata: {
            a: { source: a.source, url: a.url, attribution: a.attribution },
            b: { source: b.source, url: b.url, attribution: b.attribution },
          },
          evidence_ids: pickEvidenceIds(a, b),
        });
      }
    }
  }

  return out;
}

// ── Performance limits (phase 7) ───────────────────────────────────────────

/**
 * Hard upper bound on how many evidence rows (= sources) the detector will
 * process for a single signal. Above this, detection is SKIPPED and the
 * ingest pipeline tags the signal with `complex_signal` instead of silently
 * truncating. The cap protects the hourly worker from pathological groups
 * (viral event with 200+ outlets, all reposting the same wire copy) that
 * would otherwise inflate CPU and memory linearly on every rerun.
 */
export const MAX_SOURCES_PER_SIGNAL = 20;

/**
 * Hard upper bound on the number of extracted claims per signal. Claims are
 * currently 1:1 with evidence rows, so the source limit dominates, but we
 * keep an explicit claim cap so a future multi-claim extractor cannot
 * regress this guarantee by accident.
 */
export const MAX_CLAIMS_PER_SIGNAL = 50;

export type InconsistencySkipReason = 'too_many_sources' | 'too_many_claims';

export interface InconsistencyResult {
  contradictions: DetectedContradiction[];
  /** True when the wrapper refused to run because a limit was exceeded. */
  skipped: boolean;
  /** Populated only when `skipped` is true. */
  reason: InconsistencySkipReason | null;
  /** Raw counts for logging / ops visibility. */
  source_count: number;
  claim_count: number;
}

/**
 * Limit-aware wrapper around `detectInconsistencies`.
 *
 * Ingest pipelines MUST call this function, not `detectInconsistencies`
 * directly. When a signal exceeds either limit the wrapper:
 *   - returns an empty contradictions array (no partial / truncated output),
 *   - sets `skipped = true` with a machine-readable `reason`,
 *   - leaves the caller to tag the signal with `complex_signal` and to log
 *     the event for ops telemetry.
 *
 * Performance: O(n) plus the O(n) detector call. No LLM work, no network.
 */
export function detectInconsistenciesWithLimits(
  claims: Claim[],
  opts: { sources_count?: number } = {},
): InconsistencyResult {
  const source_count =
    typeof opts.sources_count === 'number' ? opts.sources_count : claims.length;
  const claim_count = claims.length;

  if (source_count > MAX_SOURCES_PER_SIGNAL) {
    return {
      contradictions: [],
      skipped: true,
      reason: 'too_many_sources',
      source_count,
      claim_count,
    };
  }
  if (claim_count > MAX_CLAIMS_PER_SIGNAL) {
    return {
      contradictions: [],
      skipped: true,
      reason: 'too_many_claims',
      source_count,
      claim_count,
    };
  }

  return {
    contradictions: detectInconsistencies(claims),
    skipped: false,
    reason: null,
    source_count,
    claim_count,
  };
}

// ── Row shaping ────────────────────────────────────────────────────────────

/**
 * Shape detected contradictions into DB-ready rows. Both the new contract
 * columns (`type`, `severity`, `summary`, `metadata`) and the legacy columns
 * (`claim`, `observation`, `explanation`, `confidence`) are populated so
 * older readers continue to work.
 */
export function contradictionsToRows(
  signalId: string,
  detected: DetectedContradiction[],
): Contradiction[] {
  return detected.map((d) => ({
    signal_id: signalId,
    type: d.type,
    severity: d.severity,
    summary: d.summary,
    metadata: d.metadata,
    evidence_ids: d.evidence_ids,
    // legacy columns — kept until the web layer fully moves off them
    claim: d.summary,
    observation: d.summary,
    explanation: null,
    confidence:
      d.severity === 'high' ? 80 : d.severity === 'medium' ? 60 : 40,
  }));
}
