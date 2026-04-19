import type { Contradiction, EvidenceItem, Signal } from './types';

/**
 * Lightweight, deterministic contradiction detector.
 *
 * Philosophy: we surface *inconsistencies* between claims and observed data.
 * We never accuse — we present: claim vs observation + confidence + evidence.
 *
 * v1 pattern: a single signal whose evidence rows disagree on a material
 * factual dimension (e.g. death count, magnitude, "ceasefire" vs ongoing
 * casualties) is flagged for review.
 */

export interface InconsistencyHint {
  kind: 'numeric' | 'assertion' | 'temporal';
  claim: string;
  observation: string;
  explanation: string;
  confidence: number;
}

export function detectInconsistencies(
  signal: Pick<Signal, 'title' | 'summary'>,
  evidence: EvidenceItem[],
): InconsistencyHint[] {
  const hints: InconsistencyHint[] = [];
  if (evidence.length < 2) return hints;

  // 1) Numeric disagreement on the same magnitude/casualty domain.
  const nums = evidence
    .map(e => ({ src: e.domain, nums: extractNumbers(`${e.title ?? ''} ${e.excerpt ?? ''}`) }))
    .filter(e => e.nums.length > 0);
  if (nums.length >= 2) {
    const first = nums[0]!.nums[0]!;
    const disagrees = nums.find(n => n.nums[0] !== undefined && n.nums[0] !== first && materiallyDifferent(n.nums[0], first));
    if (disagrees) {
      hints.push({
        kind: 'numeric',
        claim: `${nums[0]!.src} reports ~${first}`,
        observation: `${disagrees.src} reports ~${disagrees.nums[0]}`,
        explanation: 'Two credible reports cite materially different numeric values for the same event.',
        confidence: 60,
      });
    }
  }

  // 2) Assertion disagreement: one says "ceasefire" while another reports active kinetic activity.
  const text = evidence.map(e => `${e.title ?? ''} ${e.excerpt ?? ''}`).join(' ').toLowerCase();
  if (/ceasefire|truce/.test(text) && /(airstrike|shelling|missile|killed|casualt)/.test(text)) {
    hints.push({
      kind: 'assertion',
      claim: 'A ceasefire/truce is referenced in at least one source.',
      observation: 'Kinetic activity (airstrikes/shelling/casualties) is also referenced in the same signal.',
      explanation: 'Public claim and on-the-ground reporting appear inconsistent for this window.',
      confidence: 55,
    });
  }

  return hints;
}

export function toContradictions(
  signalId: string,
  hints: InconsistencyHint[],
  evidenceIds: string[] = [],
): Contradiction[] {
  return hints.map(h => ({
    signal_id: signalId,
    claim: h.claim,
    observation: h.observation,
    explanation: h.explanation,
    confidence: h.confidence,
    evidence_ids: evidenceIds,
  }));
}

// ── helpers ────────────────────────────────────────────────────────────────

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

function materiallyDifferent(a: number, b: number): boolean {
  if (a === 0 || b === 0) return a !== b;
  const ratio = a > b ? a / b : b / a;
  return ratio >= 1.5;
}
