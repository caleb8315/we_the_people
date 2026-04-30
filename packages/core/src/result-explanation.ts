/**
 * Result explanation (April 2026 upgrade — sixth ship of the evidence
 * comparison upgrade plan).
 *
 * Produce four reader-facing sections from the upgraded analysis:
 *
 *   why_this_result          why the confidence band landed here
 *   what_would_resolve_this   concrete things that would change the picture
 *   what_sources_agree_on     consensus points across the corpus
 *   what_sources_disagree_on  conflicts surfaced by the analyzer
 *
 * Each section is a list of plain-English bullets. Bullets are
 * deterministic, never claim truth, and never re-paraphrase source
 * text — they're composed from the structured data the upstream layers
 * produced.
 */

import type { ConfidenceBreakdown } from './confidence-breakdown';
import type {
  AnalyzedConflict,
  ConflictSummary,
} from './conflict-analysis';
import type {
  RankedSourceSummary,
} from './source-ranking';
import type { EvidenceCardSummary } from './evidence-cards';
import type { ConfidenceBand } from './confidence';

export interface ResultExplanation {
  why_this_result: string[];
  what_would_resolve_this: string[];
  what_sources_agree_on: string[];
  what_sources_disagree_on: string[];
  /** A short positioning sentence emphasising comparison + transparency. */
  positioning: string;
}

export interface BuildResultExplanationInput {
  band: ConfidenceBand;
  breakdown: ConfidenceBreakdown;
  ranked_summary: RankedSourceSummary;
  conflicts: AnalyzedConflict[];
  conflict_summary: ConflictSummary;
  cards_summary: EvidenceCardSummary;
  /** Stance counts mapped from cards. */
  has_anchor: boolean;
  is_text_only: boolean;
  is_social: boolean;
}

const POSITIONING =
  'Crosscheck compares what sources are saying. It does not decide what is true — read the evidence, weigh the agreement, and account for any bias signals.';

function buildWhy(input: BuildResultExplanationInput): string[] {
  const out: string[] = [];
  const { band, breakdown, ranked_summary: r } = input;
  switch (band) {
    case 'high':
      out.push(
        `Confidence is ${breakdown.composite}/100 because ${r.primaries + r.officials > 0 ? 'primary / official sources are present' : 'multiple rated outlets agree on the basic shape'} and no material disagreements were detected.`,
      );
      break;
    case 'medium':
      out.push(
        `Confidence is ${breakdown.composite}/100 — there is real corroboration, but the comparison is still missing pieces (see "What would resolve this").`,
      );
      break;
    case 'contested':
      out.push(
        `Confidence is ${breakdown.composite}/100 because at least one source materially disagrees with another. The verdict here is "compare the sides", not "this is true / false".`,
      );
      break;
    case 'low':
    default:
      out.push(
        `Confidence is ${breakdown.composite}/100 because the corpus is too thin or too one-sided to draw a useful comparison yet.`,
      );
      break;
  }
  // Surface the strongest reason from each component.
  const compEntries: Array<[string, ConfidenceBreakdown['components']['source_agreement']]> = [
    ['Source agreement', breakdown.components.source_agreement],
    ['Source quality', breakdown.components.source_quality],
    ['Claim directness', breakdown.components.claim_directness],
    ['Evidence completeness', breakdown.components.evidence_completeness],
  ];
  // Pick the lowest-scoring component as the *limiting factor* and one
  // of the highest as the *supporting factor*. Together they explain the
  // composite score in two lines.
  const sorted = [...compEntries].sort((a, b) => a[1].score - b[1].score);
  const [limitName, limit] = sorted[0]!;
  const [supportName, support] = sorted[sorted.length - 1]!;
  if (limit.score < support.score) {
    out.push(`Limited by **${limitName.toLowerCase()}** (${limit.score}/100): ${limit.reasons[0] ?? 'see breakdown'}.`);
    out.push(`Supported by **${supportName.toLowerCase()}** (${support.score}/100): ${support.reasons[0] ?? 'see breakdown'}.`);
  }
  for (const reason of breakdown.penalty_reasons) {
    out.push(`Penalty applied: ${reason}`);
  }
  return out.slice(0, 5);
}

function buildResolve(input: BuildResultExplanationInput): string[] {
  const out: string[] = [];
  const { ranked_summary: r, conflict_summary: cs, conflicts, band } = input;

  if (cs.by_type.direct_contradiction > 0) {
    out.push('A correction or update from one of the conflicting sources reconciling the disputed detail.');
  }
  if (cs.by_type.framing_difference > 0) {
    out.push('An official statement (government, institution, primary actor) clarifying the cause or attribution.');
  }
  if (cs.by_type.timeline_mismatch > 0) {
    out.push('A timestamped, primary-source confirmation of when the event actually occurred.');
  }
  if (cs.by_type.missing_context > 0) {
    out.push('Reporting that names the specific actors, locations, or numbers from the claim and either confirms or corrects them.');
  }
  if (r.total < 3) {
    out.push('Two or three more independent newsrooms picking up the story.');
  }
  if (r.primaries === 0 && r.officials === 0) {
    out.push('A primary observation (sensor reading, official bulletin, on-scene reporting) instead of just media coverage.');
  }
  if (r.syndicated_or_owned >= 2) {
    out.push('Independent reporting that is not derived from the same wire copy already in the corpus.');
  }
  if (input.is_social && !input.has_anchor) {
    out.push('A link to a primary article instead of a social-media post — social posts cap the comparison.');
  }
  if (input.is_text_only) {
    out.push('Re-submit with the URL the claim came from so the comparison can use the source directly.');
  }
  if (band === 'high' && conflicts.length === 0) {
    out.push('Already strong — the picture would only sharpen if a primary observation joined the corpus.');
  }
  if (out.length === 0) {
    out.push('More independent reporting, or a primary observation, would sharpen the comparison.');
  }
  return out.slice(0, 5);
}

function buildAgreeOn(input: BuildResultExplanationInput): string[] {
  const out: string[] = [];
  const { ranked_summary: r, cards_summary: c } = input;
  if (c.supports >= 2) {
    out.push(`${c.supports} source${c.supports === 1 ? '' : 's'} describe the event the same way at the basic level.`);
  }
  if (r.primaries > 0) {
    out.push('Primary observation(s) confirm the underlying event occurred.');
  }
  if (r.officials > 0) {
    out.push('Official bulletin(s) acknowledge the event.');
  }
  if (r.rated_outlets >= 2) {
    out.push(`${r.rated_outlets} rated outlets are independently carrying the same basic story.`);
  }
  if (out.length === 0 && r.total >= 1) {
    out.push('Sources broadly mention the event, but agreement on specifics could not be evaluated.');
  }
  return out.slice(0, 4);
}

function buildDisagreeOn(input: BuildResultExplanationInput): string[] {
  const out: string[] = [];
  for (const c of input.conflicts) {
    if (c.type === 'insufficient_evidence') continue;
    out.push(`${c.label} (severity ${Math.round(c.severity_score)}/100): ${c.summary}`);
  }
  if (input.cards_summary.disputes > 0 && out.length === 0) {
    out.push(`${input.cards_summary.disputes} source${input.cards_summary.disputes === 1 ? '' : 's'} disputes part of the claim — see the evidence cards for details.`);
  }
  if (out.length === 0) {
    out.push('No material disagreements detected across the available sources.');
  }
  return out.slice(0, 4);
}

export function buildResultExplanation(
  input: BuildResultExplanationInput,
): ResultExplanation {
  return {
    why_this_result: buildWhy(input),
    what_would_resolve_this: buildResolve(input),
    what_sources_agree_on: buildAgreeOn(input),
    what_sources_disagree_on: buildDisagreeOn(input),
    positioning: POSITIONING,
  };
}

export const RESULT_POSITIONING_LINE = POSITIONING;
