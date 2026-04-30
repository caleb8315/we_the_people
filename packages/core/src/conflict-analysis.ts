/**
 * Conflict analysis (April 2026 upgrade — second ship of the evidence
 * comparison upgrade plan).
 *
 * The existing `contradictions.ts` module emits *persisted* DB rows with
 * three deterministic types (`numeric_conflict`, `presence_conflict`,
 * `cause_conflict`) — that contract is locked by a SQL check constraint
 * (migration 014) and we don't break it.
 *
 * This module sits ABOVE that detector. It re-classifies the same
 * contradictions into the broader, reader-facing taxonomy the upgrade
 * plan calls for, plus three new categories that don't require changing
 * the DB schema:
 *
 *   direct_contradiction     — one source asserts X, another asserts ¬X.
 *                              Carries through `numeric_conflict` and
 *                              `presence_conflict` rows verbatim.
 *   framing_difference       — same underlying event, different framing
 *                              (cause / attribution / motive). Maps from
 *                              `cause_conflict` rows.
 *   timeline_mismatch        — sources disagree on *when*. Detected by
 *                              comparing `published_at` distance against
 *                              the claim window.
 *   missing_context          — claim references actors/places/numbers
 *                              that no source corroborates.
 *   insufficient_evidence    — too few sources, or no claim-relevant
 *                              evidence rows at all, to judge anything.
 *
 * Every result carries a NUMERIC severity (0–100) so the UI can sort and
 * tier conflicts without recomputing thresholds.
 *
 * This module is pure: no DB writes, no LLM, no network.
 */

import type { EvidenceItem } from './types';
import type {
  DetectedContradiction,
  ContradictionType,
} from './contradictions';

export type AnalyzedConflictType =
  | 'direct_contradiction'
  | 'framing_difference'
  | 'timeline_mismatch'
  | 'missing_context'
  | 'insufficient_evidence';

export interface AnalyzedConflict {
  type: AnalyzedConflictType;
  /** Short label for chips / badges. */
  label: string;
  /** One-sentence summary, plain English. Always safe to render. */
  summary: string;
  /** 0–100. Higher = more material. */
  severity_score: number;
  /** Human band, derived from `severity_score`. */
  severity_band: 'low' | 'medium' | 'high';
  /** Optional pointers back to the involved sources. */
  sources: Array<{ url: string; domain: string }>;
  /** Stable origin tag for traceability. */
  origin:
    | 'detector_numeric'
    | 'detector_presence'
    | 'detector_cause'
    | 'timeline'
    | 'missing_context'
    | 'insufficient_evidence';
}

export interface ConflictAnalysisInput {
  contradictions: DetectedContradiction[];
  evidence: EvidenceItem[];
  /** Submitted claim title — used to look for un-corroborated tokens. */
  claim_title?: string | null;
  /** Submitted claim text — same. */
  claim_text?: string | null;
}

const HIGH_THRESHOLD = 70;
const MEDIUM_THRESHOLD = 40;

const TYPE_LABELS: Record<AnalyzedConflictType, string> = {
  direct_contradiction: 'Direct contradiction',
  framing_difference: 'Framing difference',
  timeline_mismatch: 'Timeline mismatch',
  missing_context: 'Missing context',
  insufficient_evidence: 'Insufficient evidence',
};

function bandFromScore(score: number): 'low' | 'medium' | 'high' {
  if (score >= HIGH_THRESHOLD) return 'high';
  if (score >= MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

function severityForDetector(c: DetectedContradiction): number {
  // Map the 3-tier `low|medium|high` enum to numeric so the UI can
  // sort. Numeric conflict severity already encoded ratio internally,
  // so we boost extremes a bit further.
  const base = c.severity === 'high' ? 80 : c.severity === 'medium' ? 55 : 30;
  if (c.type === 'numeric_conflict') {
    const ratio = (c.metadata?.ratio as number | undefined) ?? null;
    if (ratio && Number.isFinite(ratio)) {
      if (ratio >= 5) return Math.min(100, base + 10);
      if (ratio >= 3) return Math.min(100, base + 5);
    }
  }
  return base;
}

function pickSources(c: DetectedContradiction): Array<{ url: string; domain: string }> {
  const out: Array<{ url: string; domain: string }> = [];
  const m = c.metadata as Record<string, unknown>;
  for (const key of ['a', 'b', 'assertion', 'observation']) {
    const entry = m?.[key];
    if (entry && typeof entry === 'object') {
      const url = (entry as Record<string, unknown>).url;
      const source = (entry as Record<string, unknown>).source;
      if (typeof url === 'string' && url.length > 0) {
        out.push({ url, domain: typeof source === 'string' ? source : '' });
      }
    }
  }
  return out;
}

function detectorTypeToOrigin(t: ContradictionType): AnalyzedConflict['origin'] {
  switch (t) {
    case 'numeric_conflict':
      return 'detector_numeric';
    case 'presence_conflict':
      return 'detector_presence';
    case 'cause_conflict':
      return 'detector_cause';
  }
}

function detectorTypeToAnalyzed(t: ContradictionType): AnalyzedConflictType {
  switch (t) {
    case 'numeric_conflict':
    case 'presence_conflict':
      return 'direct_contradiction';
    case 'cause_conflict':
      return 'framing_difference';
  }
}

const TIMELINE_HINT_RX =
  /\b(today|yesterday|tonight|this morning|this evening|this week|last week|hours ago|minutes ago|breaking|just now)\b/i;

function detectTimelineMismatch(
  evidence: EvidenceItem[],
  claimText: string | null,
): AnalyzedConflict | null {
  const stamps: number[] = [];
  for (const e of evidence) {
    if (!e.published_at) continue;
    const t = Date.parse(e.published_at);
    if (Number.isFinite(t)) stamps.push(t);
  }
  if (stamps.length < 2) return null;
  stamps.sort((a, b) => a - b);
  const span_hours = (stamps[stamps.length - 1]! - stamps[0]!) / 36e5;

  const claimMentionsRecency = claimText ? TIMELINE_HINT_RX.test(claimText) : false;

  // Multi-day span on a "breaking" claim is a real timeline mismatch.
  if (claimMentionsRecency && span_hours > 24) {
    const score = Math.min(100, 50 + Math.round(span_hours / 6));
    return {
      type: 'timeline_mismatch',
      label: TYPE_LABELS.timeline_mismatch,
      summary:
        'The claim suggests a recent / breaking event, but corroborating sources span more than a day apart — they may be describing different incidents or older reporting being recirculated.',
      severity_score: score,
      severity_band: bandFromScore(score),
      sources: [],
      origin: 'timeline',
    };
  }
  // Even without "breaking" framing, a >7-day span across "supporting"
  // sources is worth surfacing as a low-severity note.
  if (span_hours > 24 * 7) {
    const score = 35;
    return {
      type: 'timeline_mismatch',
      label: TYPE_LABELS.timeline_mismatch,
      summary:
        'Supporting sources span more than a week — the older items may be background or related events rather than direct corroboration.',
      severity_score: score,
      severity_band: bandFromScore(score),
      sources: [],
      origin: 'timeline',
    };
  }
  return null;
}

const STOPWORDS = new Set([
  'a','an','the','and','or','but','of','to','in','on','at','for','by','with',
  'from','as','is','are','was','were','be','been','being','that','this','these',
  'those','it','its','into','over','new','news','live','latest','breaking','update',
  'updates','says','said','will','would','could','should','may','might','can',
  'has','have','had','not','one','two','say','also','about','here','today',
  'when','where','what','which','while','show','shows','many','much','their','than',
]);

const PROPER_NOUN_RX = /\b([A-Z][a-zA-Z'’\-]{2,}(?:\s+[A-Z][a-zA-Z'’\-]{2,})?)\b/g;
const NUMBER_RX = /\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\b/g;

function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.split(/[^a-zA-Z0-9]+/)) {
    const w = raw.toLowerCase();
    if (w.length < 4) continue;
    if (STOPWORDS.has(w)) continue;
    out.add(w);
  }
  return out;
}

function extractMatches(text: string, rx: RegExp): string[] {
  rx.lastIndex = 0;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    out.add((m[1] ?? '').trim());
  }
  return [...out].filter(Boolean);
}

function detectMissingContext(
  evidence: EvidenceItem[],
  claimText: string,
): AnalyzedConflict | null {
  if (!claimText.trim()) return null;
  const evidenceText = evidence
    .map((e) => `${e.title ?? ''} ${e.excerpt ?? ''}`)
    .join('\n')
    .toLowerCase();

  const claimNouns = extractMatches(claimText, PROPER_NOUN_RX)
    .filter((n) => !STOPWORDS.has(n.toLowerCase()))
    .slice(0, 12);
  const claimNumbers = extractMatches(claimText, NUMBER_RX).filter(
    (n) => Number(n.replace(/,/g, '')) >= 5,
  );

  const evidenceTokens = tokenize(evidenceText);
  const missingNouns = claimNouns.filter(
    (n) => !evidenceText.includes(n.toLowerCase()) && !evidenceTokens.has(n.split(/\s+/)[0]!.toLowerCase()),
  );
  const missingNumbers = claimNumbers.filter((n) => !evidenceText.includes(n));

  const missing = [...missingNouns, ...missingNumbers];
  if (missing.length < 2 || evidence.length === 0) return null;

  // Severity scales with the share of unique entities/numbers absent.
  const denominator = Math.max(claimNouns.length + claimNumbers.length, 1);
  const ratio = missing.length / denominator;
  const score = Math.min(80, 30 + Math.round(ratio * 60));

  const sample = missing.slice(0, 3).join(', ');
  return {
    type: 'missing_context',
    label: TYPE_LABELS.missing_context,
    summary: `Specific details from the claim (${sample}${missing.length > 3 ? ', …' : ''}) are not corroborated by any source we found.`,
    severity_score: score,
    severity_band: bandFromScore(score),
    sources: [],
    origin: 'missing_context',
  };
}

function detectInsufficientEvidence(
  evidence: EvidenceItem[],
): AnalyzedConflict | null {
  const total = evidence.length;
  if (total >= 3) return null;
  if (total === 0) {
    return {
      type: 'insufficient_evidence',
      label: TYPE_LABELS.insufficient_evidence,
      summary: 'No corroborating evidence was found across any of the systems queried — the claim cannot be compared yet.',
      severity_score: 80,
      severity_band: 'high',
      sources: [],
      origin: 'insufficient_evidence',
    };
  }
  if (total === 1) {
    return {
      type: 'insufficient_evidence',
      label: TYPE_LABELS.insufficient_evidence,
      summary: 'Only one source is available so far — comparison is not meaningful with a single source.',
      severity_score: 65,
      severity_band: 'medium',
      sources: [],
      origin: 'insufficient_evidence',
    };
  }
  return {
    type: 'insufficient_evidence',
    label: TYPE_LABELS.insufficient_evidence,
    summary: 'Two sources is a thin base for comparison — wait for additional independent reporting.',
    severity_score: 45,
    severity_band: 'medium',
    sources: [],
    origin: 'insufficient_evidence',
  };
}

/**
 * Run the full conflict analysis.
 *
 * Returns an ordered list (highest severity first) of typed conflicts.
 * Empty array means "no analyzable conflict" — which is itself a useful
 * signal the UI can render as "Sources broadly agree".
 */
export function analyzeConflicts(input: ConflictAnalysisInput): AnalyzedConflict[] {
  const out: AnalyzedConflict[] = [];

  for (const c of input.contradictions) {
    const score = severityForDetector(c);
    out.push({
      type: detectorTypeToAnalyzed(c.type),
      label: TYPE_LABELS[detectorTypeToAnalyzed(c.type)],
      summary: c.summary,
      severity_score: score,
      severity_band: bandFromScore(score),
      sources: pickSources(c),
      origin: detectorTypeToOrigin(c.type),
    });
  }

  const claim = `${input.claim_title ?? ''}\n${input.claim_text ?? ''}`.trim();
  const tl = detectTimelineMismatch(input.evidence, claim || null);
  if (tl) out.push(tl);

  const mc = detectMissingContext(input.evidence, claim);
  if (mc) out.push(mc);

  const insufficient = detectInsufficientEvidence(input.evidence);
  if (insufficient) out.push(insufficient);

  // Stable sort: severity desc, then keep input order for ties.
  out.sort((a, b) => b.severity_score - a.severity_score);
  return out;
}

/** Aggregate counts the UI uses for the conflict header. */
export interface ConflictSummary {
  total: number;
  by_type: Record<AnalyzedConflictType, number>;
  worst_severity: number;
  /** True when the only reason we surfaced is "insufficient_evidence". */
  only_insufficient: boolean;
}

export function summarizeConflicts(items: AnalyzedConflict[]): ConflictSummary {
  const sum: ConflictSummary = {
    total: items.length,
    by_type: {
      direct_contradiction: 0,
      framing_difference: 0,
      timeline_mismatch: 0,
      missing_context: 0,
      insufficient_evidence: 0,
    },
    worst_severity: 0,
    only_insufficient: false,
  };
  for (const c of items) {
    sum.by_type[c.type] += 1;
    if (c.severity_score > sum.worst_severity) sum.worst_severity = c.severity_score;
  }
  sum.only_insufficient = items.length > 0 && items.every((i) => i.type === 'insufficient_evidence');
  return sum;
}

export const CONFLICT_TYPE_LABELS = TYPE_LABELS;
