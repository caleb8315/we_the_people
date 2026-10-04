import type { SourceLedger } from './ledger';
import type { Confidence, PhysicalCheck, Verdict, VerifiedCitation } from './schema';

export interface GuardrailInput {
  verdict: Verdict;
  confidence: Confidence;
  claims: Array<{ text: string; verdict: Verdict; explanation: string; citations: VerifiedCitation[] }>;
  physical: PhysicalCheck[];
  ledger: SourceLedger;
  citationsRemoved: number;
  citationsChecked: number;
}

export interface GuardrailResult {
  verdict: Verdict;
  confidence: Confidence;
  claims: GuardrailInput['claims'];
  physical: PhysicalCheck[];
  notes: string[];
  independentOutlets: number;
}

const AFFIRMING: Verdict[] = ['true', 'mostly_true'];
const NEGATING: Verdict[] = ['false', 'fabricated'];
const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function capConfidence(c: Confidence, max: Confidence): Confidence {
  return RANK[c] > RANK[max] ? max : c;
}

/** Distinct outlets behind a set of citations, excluding state-controlled media. */
export function independentOutlets(citations: VerifiedCitation[], ledger: SourceLedger): Set<string> {
  const out = new Set<string>();
  for (const c of citations) {
    const e = ledger.get(c.source_id);
    if (!e || e.ownership === 'state_controlled') continue;
    out.add(e.domain);
  }
  return out;
}

/**
 * Deterministic checks applied after the model writes its report. The model
 * proposes; these rules make sure the verdict is backed by citations that
 * survived verification.
 */
export function applyGuardrails(input: GuardrailInput): GuardrailResult {
  const notes: string[] = [];
  const { ledger } = input;

  // "Nothing detected" by a catalog/sensor is never a contradiction.
  const physical = input.physical.map((p) => {
    const isImagery = p.kind === 'satellite_imagery' || p.kind === 'night_lights';
    if (!isImagery && p.hits === 0 && p.result === 'inconsistent') {
      notes.push(`Physical check ${p.id}: "no detection" reclassified from inconsistent to no_data.`);
      return { ...p, result: 'no_data' as const };
    }
    return p;
  });


  const claims = input.claims.map((claim) => {
    const supports = claim.citations.filter((c) => c.stance === 'supports');
    const refutes = claim.citations.filter((c) => c.stance === 'refutes');
    if (AFFIRMING.includes(claim.verdict) && independentOutlets(supports, ledger).size === 0) {
      notes.push(`Claim "${short(claim.text)}" downgraded to unproven: no verified supporting quote from an independent source.`);
      return { ...claim, verdict: 'unproven' as Verdict };
    }
    if (NEGATING.includes(claim.verdict) && refutes.length === 0 && !hasContradictingObservation(physical)) {
      notes.push(`Claim "${short(claim.text)}" downgraded to unproven: no verified refuting quote or contradicting observation.`);
      return { ...claim, verdict: 'unproven' as Verdict };
    }
    return claim;
  });

  const all = claims.flatMap((c) => c.citations);
  const supports = all.filter((c) => c.stance === 'supports');
  const refutes = all.filter((c) => c.stance === 'refutes');
  const independent = independentOutlets(all, ledger);

  let verdict = input.verdict;
  if (AFFIRMING.includes(verdict) && independentOutlets(supports, ledger).size === 0) {
    notes.push('Overall verdict downgraded to unproven: no verified independent support.');
    verdict = 'unproven';
  }
  if (NEGATING.includes(verdict) && refutes.length === 0 && !hasContradictingObservation(physical)) {
    notes.push('Overall verdict downgraded to unproven: no verified refutation.');
    verdict = 'unproven';
  }

  let confidence = input.confidence;
  if (all.length < 2) {
    confidence = 'low';
    notes.push('Confidence set to low: fewer than two verified citations.');
  } else if (independent.size < 2 && confidence === 'high') {
    confidence = 'medium';
    notes.push('Confidence capped at medium: fewer than two independent outlets.');
  }
  if (input.citationsChecked > 0 && input.citationsRemoved / input.citationsChecked > 0.4) {
    confidence = capConfidence(confidence, 'medium');
    notes.push(`${input.citationsRemoved} of ${input.citationsChecked} citations could not be verified against the sources and were removed.`);
  }
  if (NEGATING.includes(verdict) && refutes.length === 0) {
    confidence = capConfidence(confidence, 'medium');
    notes.push('Confidence capped at medium: refutation rests on physical observation alone.');
  }

  return { verdict, confidence, claims, physical, notes, independentOutlets: independent.size };
}

function hasContradictingObservation(physical: PhysicalCheck[]): boolean {
  return physical.some((p) => p.result === 'inconsistent' && (p.hits > 0 || p.kind === 'satellite_imagery' || p.kind === 'night_lights'));
}

function short(s: string): string {
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}
