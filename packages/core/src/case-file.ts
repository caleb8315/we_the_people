import type { EvidenceItem } from './types';
import type { DetectedContradiction } from './contradictions';
import type { RankedSource } from './source-ranking';
import type { EvidenceCard } from './evidence-cards';
import type { ConfidenceBand } from './confidence';
import {
  decomposeClaims,
  type AtomicClaim,
  type ClaimKind,
} from './claim-decomposition';

export type ClaimEvidenceStance =
  | 'directly_supports'
  | 'partially_supports'
  | 'contradicts'
  | 'weakens'
  | 'context_only'
  | 'mentions_without_evidence'
  | 'unrelated'
  | 'cannot_determine';

export type ClaimVerdict =
  | 'supported'
  | 'partly_supported'
  | 'unsupported'
  | 'contradicted'
  | 'misleading_framing'
  | 'unresolved'
  | 'not_enough_evidence'
  | 'not_fact_checkable'
  | 'context_only';

export interface CaseFileEvidence {
  url: string;
  domain: string;
  title: string | null;
  excerpt: string | null;
  published_at: string | null;
  source_role: RankedSource['role'] | null;
  source_rank: number | null;
  source_score: number | null;
  source_components: RankedSource['components'] | null;
  is_credible: boolean;
  stance: ClaimEvidenceStance;
  stance_confidence: number;
  explanation: string;
  retrieved_via: string | null;
}

export interface ClaimUncertaintyReport {
  missing_evidence: string[];
  conflicting_evidence: string[];
  weak_points: string[];
  what_would_resolve: string[];
  not_fact_checkable_reasons: string[];
}

export interface ClaimCaseFile {
  claim: AtomicClaim;
  verdict: ClaimVerdict;
  confidence_score: number;
  confidence_band: ConfidenceBand;
  support_count: number;
  contradiction_count: number;
  context_count: number;
  evidence: CaseFileEvidence[];
  uncertainty: ClaimUncertaintyReport;
  summary: string;
}

export interface EvidenceCaseFile {
  id: string;
  title: string;
  input_text: string | null;
  input_url: string | null;
  overall_verdict: ClaimVerdict;
  overall_band: ConfidenceBand;
  overall_summary: string;
  claims: ClaimCaseFile[];
  what_we_can_say: string[];
  what_remains_uncertain: string[];
  what_would_make_this_stronger: string[];
}

export interface BuildEvidenceCaseFileInput {
  title: string | null;
  text: string | null;
  url: string | null;
  evidence: EvidenceItem[];
  ranked_sources: RankedSource[];
  evidence_cards: EvidenceCard[];
  contradictions: DetectedContradiction[];
  overall_band: ConfidenceBand;
  case_id?: string | null;
}

const PRIMARY_ROLES = new Set<RankedSource['role']>(['primary', 'official']);
const CONTEXT_ROLES = new Set<RankedSource['role']>(['reference', 'aggregator']);
const WEAK_ROLES = new Set<RankedSource['role']>(['social', 'unknown']);

export function buildEvidenceCaseFile(input: BuildEvidenceCaseFileInput): EvidenceCaseFile {
  const sourceText = [input.title, input.text].filter(Boolean).join('\n');
  const claims = decomposeClaims({
    text: sourceText,
    title: input.title,
    url: input.url,
  });
  const rankedByUrl = new Map(input.ranked_sources.map((r) => [r.url.toLowerCase(), r]));
  const cardsByUrl = new Map(input.evidence_cards.map((c) => [c.url.toLowerCase(), c]));
  const conflictedUrls = collectContradictionUrls(input.contradictions);

  const claimFiles = claims.map((claim) =>
    buildClaimCaseFile({
      claim,
      evidence: input.evidence,
      rankedByUrl,
      cardsByUrl,
      conflictedUrls,
    }),
  );

  const overallVerdict = aggregateVerdict(claimFiles, claims.length);
  const whatWeCanSay = buildWhatWeCanSay(claimFiles);
  const uncertain = buildOverallUncertainty(claimFiles);
  const stronger = buildOverallResolve(claimFiles);

  return {
    id: input.case_id ?? stableCaseId(sourceText || input.url || 'case'),
    title: pickCaseTitle(input.title, input.text, input.url),
    input_text: input.text,
    input_url: input.url,
    overall_verdict: overallVerdict,
    overall_band: input.overall_band,
    overall_summary: buildOverallSummary(overallVerdict, claimFiles),
    claims: claimFiles,
    what_we_can_say: whatWeCanSay,
    what_remains_uncertain: uncertain,
    what_would_make_this_stronger: stronger,
  };
}

function buildClaimCaseFile(input: {
  claim: AtomicClaim;
  evidence: EvidenceItem[];
  rankedByUrl: Map<string, RankedSource>;
  cardsByUrl: Map<string, EvidenceCard>;
  conflictedUrls: Set<string>;
}): ClaimCaseFile {
  const evidence = input.evidence
    .map((e) =>
      mapEvidenceToClaim({
        claim: input.claim,
        evidence: e,
        ranked: input.rankedByUrl.get(e.url.toLowerCase()),
        card: input.cardsByUrl.get(e.url.toLowerCase()),
        conflicted: input.conflictedUrls.has(e.url),
      }),
    )
    .filter((e) => e.stance !== 'unrelated')
    .sort((a, b) => {
      const stanceDelta = stanceWeight(a.stance) - stanceWeight(b.stance);
      if (stanceDelta !== 0) return stanceDelta;
      return (a.source_rank ?? 999) - (b.source_rank ?? 999);
    })
    .slice(0, 12);

  const supportCount = evidence.filter((e) =>
    e.stance === 'directly_supports' || e.stance === 'partially_supports',
  ).length;
  const contradictionCount = evidence.filter((e) =>
    e.stance === 'contradicts' || e.stance === 'weakens',
  ).length;
  const contextCount = evidence.filter((e) =>
    e.stance === 'context_only' || e.stance === 'mentions_without_evidence',
  ).length;

  const confidence = scoreClaim({
    claim: input.claim,
    evidence,
    supportCount,
    contradictionCount,
    contextCount,
  });
  const verdict = decideClaimVerdict({
    claim: input.claim,
    evidence,
    supportCount,
    contradictionCount,
    contextCount,
    score: confidence,
  });
  const band = bandFromClaimScore(verdict, confidence);
  const uncertainty = buildClaimUncertainty({
    claim: input.claim,
    verdict,
    evidence,
    supportCount,
    contradictionCount,
    contextCount,
  });

  return {
    claim: input.claim,
    verdict,
    confidence_score: confidence,
    confidence_band: band,
    support_count: supportCount,
    contradiction_count: contradictionCount,
    context_count: contextCount,
    evidence,
    uncertainty,
    summary: summarizeClaim(input.claim, verdict, supportCount, contradictionCount, contextCount),
  };
}

function mapEvidenceToClaim(input: {
  claim: AtomicClaim;
  evidence: EvidenceItem;
  ranked: RankedSource | undefined;
  card: EvidenceCard | undefined;
  conflicted: boolean;
}): CaseFileEvidence {
  const claim = input.claim;
  const sourceText = `${input.evidence.title ?? ''} ${input.evidence.excerpt ?? ''}`.toLowerCase();
  const overlap = tokenOverlap(claim.normalized_text, sourceText);
  const role = input.ranked?.role ?? null;
  let stance: ClaimEvidenceStance = 'cannot_determine';
  let stanceConfidence = 35;
  let explanation = 'Mentions related terms, but the available snippet does not clearly support or contradict this claim.';

  if (input.conflicted || input.card?.stance === 'disputes') {
    stance = 'contradicts';
    stanceConfidence = 75;
    explanation = 'This source is involved in a detected disagreement with another source.';
  } else if (role && PRIMARY_ROLES.has(role) && overlap >= 0.16) {
    stance = 'directly_supports';
    stanceConfidence = 88;
    explanation = 'Primary or official source closely matches this claim.';
  } else if (input.card?.stance === 'supports' && overlap >= 0.12) {
    stance = role && WEAK_ROLES.has(role) ? 'partially_supports' : 'directly_supports';
    stanceConfidence = role && WEAK_ROLES.has(role) ? 55 : 72;
    explanation =
      role && WEAK_ROLES.has(role)
        ? 'Related social or unrated source mentions the claim; useful as awareness, not proof.'
        : 'This source describes the same basic claim shape as other reporting.';
  } else if (role && CONTEXT_ROLES.has(role) && overlap >= 0.1) {
    stance = 'context_only';
    stanceConfidence = 55;
    explanation = 'Provides useful background, but it is not primary evidence for this claim.';
  } else if (role && WEAK_ROLES.has(role) && overlap >= 0.1) {
    stance = 'mentions_without_evidence';
    stanceConfidence = 45;
    explanation = 'Mentions the claim in a weak-evidence channel; do not treat this as confirmation.';
  } else if (overlap >= 0.24 && input.evidence.is_credible) {
    stance = 'partially_supports';
    stanceConfidence = 62;
    explanation = 'Credible source overlaps with the claim, but the snippet is not direct enough for full support.';
  } else if (overlap < 0.06) {
    stance = 'unrelated';
    stanceConfidence = 20;
    explanation = 'Insufficient overlap with this specific claim.';
  }

  return {
    url: input.evidence.url,
    domain: input.evidence.domain,
    title: input.evidence.title ?? null,
    excerpt: input.evidence.excerpt ?? null,
    published_at: input.evidence.published_at ?? null,
    source_role: role,
    source_rank: input.ranked?.rank ?? null,
    source_score: input.ranked?.score ?? null,
    source_components: input.ranked?.components ?? null,
    is_credible: input.evidence.is_credible,
    stance,
    stance_confidence: stanceConfidence,
    explanation,
    retrieved_via: input.evidence.source_id,
  };
}

function scoreClaim(input: {
  claim: AtomicClaim;
  evidence: CaseFileEvidence[];
  supportCount: number;
  contradictionCount: number;
  contextCount: number;
}): number {
  if (input.claim.checkability === 'not_checkable') return 0;
  let score = 12;
  const directSupports = input.evidence.filter((e) => e.stance === 'directly_supports');
  const partialSupports = input.evidence.filter((e) => e.stance === 'partially_supports');
  const primarySupports = directSupports.filter((e) => e.source_role && PRIMARY_ROLES.has(e.source_role));
  const credibleSupports = input.evidence.filter((e) =>
    (e.stance === 'directly_supports' || e.stance === 'partially_supports') && e.is_credible,
  );
  const independentSupportDomains = new Set(
    input.evidence
      .filter((e) => e.stance === 'directly_supports' || e.stance === 'partially_supports')
      .map((e) => e.domain),
  );

  score += Math.min(35, directSupports.length * 14);
  score += Math.min(16, partialSupports.length * 6);
  score += Math.min(18, credibleSupports.length * 6);
  score += Math.min(18, primarySupports.length * 12);
  score += Math.min(10, independentSupportDomains.size * 3);
  score += Math.min(6, input.contextCount * 2);
  score -= Math.min(45, input.contradictionCount * 20);
  if (input.claim.checkability === 'low') score -= 20;
  if (input.claim.checkability === 'medium') score -= 8;
  if (input.claim.risk_level === 'high') score -= 10;
  if (input.supportCount === 0 && input.contextCount > 0) score = Math.min(score, 35);
  if (input.evidence.length === 0) score = Math.min(score, 20);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function decideClaimVerdict(input: {
  claim: AtomicClaim;
  evidence: CaseFileEvidence[];
  supportCount: number;
  contradictionCount: number;
  contextCount: number;
  score: number;
}): ClaimVerdict {
  if (input.claim.checkability === 'not_checkable') return 'not_fact_checkable';
  if (input.contradictionCount > 0 && input.supportCount === 0) return 'contradicted';
  if (input.contradictionCount > 0 && input.supportCount > 0) return 'unresolved';
  if (input.supportCount === 0 && input.contextCount > 0) return 'context_only';
  if (input.supportCount === 0) return input.evidence.length === 0 ? 'not_enough_evidence' : 'unsupported';
  if (input.score >= 72) return 'supported';
  if (input.score >= 45) return 'partly_supported';
  return 'unresolved';
}

function buildClaimUncertainty(input: {
  claim: AtomicClaim;
  verdict: ClaimVerdict;
  evidence: CaseFileEvidence[];
  supportCount: number;
  contradictionCount: number;
  contextCount: number;
}): ClaimUncertaintyReport {
  const missing: string[] = [];
  const conflicting: string[] = [];
  const weak: string[] = [];
  const resolve: string[] = [];
  const notFactCheckable: string[] = [];

  const hasPrimary = input.evidence.some((e) => e.source_role && PRIMARY_ROLES.has(e.source_role));
  const credibleSupport = input.evidence.filter((e) =>
    e.is_credible && (e.stance === 'directly_supports' || e.stance === 'partially_supports'),
  ).length;
  const socialOnly =
    input.evidence.length > 0 &&
    input.evidence.every((e) => e.source_role === 'social' || e.source_role === 'unknown');

  if (input.claim.checkability === 'low') {
    weak.push('The claim is broad or vague, so evidence may not map cleanly to every part of it.');
    resolve.push('Rewrite the claim with specific actors, dates, locations, or numbers.');
  }
  if (input.claim.checkability === 'not_checkable') {
    notFactCheckable.push('The claim is too subjective, predictive, or unspecific for public-source verification.');
  }
  if (!hasPrimary) {
    missing.push('No primary or official source was found for this claim.');
    resolve.push(resolveHintForKind(input.claim.kind));
  }
  if (credibleSupport < 2 && input.supportCount > 0) {
    weak.push('Support is not yet backed by multiple credible independent sources.');
  }
  if (socialOnly) {
    weak.push('Available matches are social or unrated sources; they show discussion, not verification.');
    resolve.push('Find independent reporting or a primary document behind the social claim.');
  }
  if (input.contradictionCount > 0) {
    conflicting.push('At least one available source conflicts with another source on this claim.');
    resolve.push('Look for an update or correction that reconciles the conflicting versions.');
  }
  if (input.evidence.length === 0 || input.verdict === 'not_enough_evidence') {
    missing.push('No usable evidence was found for this specific claim in the current source set.');
    resolve.push('Run a deeper search or provide a source URL connected to the claim.');
  }

  return {
    missing_evidence: dedupeText(missing).slice(0, 4),
    conflicting_evidence: dedupeText(conflicting).slice(0, 4),
    weak_points: dedupeText(weak).slice(0, 4),
    what_would_resolve: dedupeText(resolve).slice(0, 5),
    not_fact_checkable_reasons: dedupeText(notFactCheckable).slice(0, 3),
  };
}

function resolveHintForKind(kind: ClaimKind): string {
  switch (kind) {
    case 'medical':
      return 'A public health agency page, clinical guideline, or peer-reviewed review would strengthen this.';
    case 'legal':
      return 'A court docket, opinion, statute, or official filing would strengthen this.';
    case 'financial':
      return 'An SEC filing, regulator notice, or company filing would strengthen this.';
    case 'scientific':
      return 'A peer-reviewed paper, dataset, or scientific agency report would strengthen this.';
    case 'quote':
      return 'A recording, transcript, or original post containing the quote would strengthen this.';
    case 'numeric':
      return 'A primary dataset or official count would strengthen this.';
    case 'image':
      return 'The original upload, metadata, or known prior appearances would strengthen this.';
    default:
      return 'A primary source or multiple independent credible reports would strengthen this.';
  }
}

function summarizeClaim(
  claim: AtomicClaim,
  verdict: ClaimVerdict,
  support: number,
  contradictions: number,
  context: number,
): string {
  switch (verdict) {
    case 'supported':
      return `${support} evidence item${support === 1 ? '' : 's'} support this claim, with enough source quality for a strong read.`;
    case 'partly_supported':
      return `${support} evidence item${support === 1 ? '' : 's'} support parts of this claim, but the record is incomplete.`;
    case 'contradicted':
      return `${contradictions} evidence item${contradictions === 1 ? '' : 's'} contradict this claim in the current corpus.`;
    case 'unresolved':
      return 'Available sources point in different directions or do not resolve the claim cleanly.';
    case 'context_only':
      return `${context} source${context === 1 ? '' : 's'} provide context, but not direct evidence for the claim.`;
    case 'not_fact_checkable':
      return `This ${claim.kind} claim is not specific enough for public-source verification.`;
    case 'unsupported':
      return 'The current corpus does not provide usable support for this claim.';
    case 'not_enough_evidence':
      return 'Not enough usable evidence was found for this claim.';
    case 'misleading_framing':
      return 'The wording appears stronger than the available evidence supports.';
  }
}

function aggregateVerdict(claims: ClaimCaseFile[], totalClaims: number): ClaimVerdict {
  if (totalClaims === 0) return 'not_enough_evidence';
  const counts = countVerdicts(claims);
  if ((counts.contradicted ?? 0) > 0 && (counts.supported ?? 0) === 0) return 'contradicted';
  if ((counts.unresolved ?? 0) > 0 || (counts.contradicted ?? 0) > 0) return 'unresolved';
  if ((counts.supported ?? 0) >= Math.ceil(totalClaims * 0.6)) return 'supported';
  if ((counts.partly_supported ?? 0) + (counts.supported ?? 0) > 0) return 'partly_supported';
  if ((counts.context_only ?? 0) > 0) return 'context_only';
  if ((counts.not_fact_checkable ?? 0) === totalClaims) return 'not_fact_checkable';
  return 'not_enough_evidence';
}

function buildOverallSummary(verdict: ClaimVerdict, claims: ClaimCaseFile[]): string {
  const counts = countVerdicts(claims);
  const parts = [
    `${claims.length} claim${claims.length === 1 ? '' : 's'} checked`,
    `${counts.supported ?? 0} supported`,
    `${counts.partly_supported ?? 0} partly supported`,
    `${(counts.unresolved ?? 0) + (counts.contradicted ?? 0)} unresolved/contradicted`,
  ];
  return `${verdictLabel(verdict)}: ${parts.join(' · ')}.`;
}

function buildWhatWeCanSay(claims: ClaimCaseFile[]): string[] {
  const out: string[] = [];
  const supported = claims.filter((c) => c.verdict === 'supported' || c.verdict === 'partly_supported');
  if (supported.length > 0) {
    out.push(
      `${supported.length} claim${supported.length === 1 ? '' : 's'} have some public evidence support.`,
    );
  }
  const primary = claims.filter((c) =>
    c.evidence.some((e) => e.source_role && PRIMARY_ROLES.has(e.source_role)),
  ).length;
  if (primary > 0) {
    out.push(`${primary} claim${primary === 1 ? '' : 's'} include primary or official-source evidence.`);
  }
  const contradicted = claims.filter((c) => c.contradiction_count > 0).length;
  if (contradicted > 0) {
    out.push(`${contradicted} claim${contradicted === 1 ? '' : 's'} have source disagreement that needs review.`);
  }
  if (out.length === 0) out.push('The current source set mainly provides context, not strong verification.');
  return out.slice(0, 4);
}

function buildOverallUncertainty(claims: ClaimCaseFile[]): string[] {
  return dedupeText(
    claims.flatMap((c) => [
      ...c.uncertainty.missing_evidence,
      ...c.uncertainty.conflicting_evidence,
      ...c.uncertainty.weak_points,
      ...c.uncertainty.not_fact_checkable_reasons,
    ]),
  ).slice(0, 6);
}

function buildOverallResolve(claims: ClaimCaseFile[]): string[] {
  return dedupeText(claims.flatMap((c) => c.uncertainty.what_would_resolve)).slice(0, 6);
}

function bandFromClaimScore(verdict: ClaimVerdict, score: number): ConfidenceBand {
  if (verdict === 'contradicted' || verdict === 'unresolved') return 'contested';
  if (score >= 72) return 'high';
  if (score >= 42) return 'medium';
  return 'low';
}

function collectContradictionUrls(contradictions: DetectedContradiction[]): Set<string> {
  const urls = new Set<string>();
  for (const c of contradictions) {
    for (const value of Object.values(c.metadata ?? {})) {
      if (!value || typeof value !== 'object') continue;
      const url = (value as Record<string, unknown>).url;
      if (typeof url === 'string') urls.add(url);
    }
  }
  return urls;
}

function tokenOverlap(a: string, b: string): number {
  const aTokens = meaningfulTokens(a);
  if (aTokens.length === 0) return 0;
  const bSet = new Set(meaningfulTokens(b));
  if (bSet.size === 0) return 0;
  let hits = 0;
  for (const token of aTokens) if (bSet.has(token)) hits += 1;
  return hits / aTokens.length;
}

function meaningfulTokens(text: string): string[] {
  const stop = new Set([
    'this',
    'that',
    'with',
    'from',
    'have',
    'has',
    'were',
    'been',
    'being',
    'they',
    'their',
    'about',
    'claim',
    'says',
    'said',
    'will',
    'would',
    'could',
    'should',
    'there',
    'where',
    'when',
    'what',
    'which',
  ]);
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !stop.has(t));
}

function stanceWeight(stance: ClaimEvidenceStance): number {
  switch (stance) {
    case 'directly_supports':
      return 1;
    case 'contradicts':
      return 2;
    case 'partially_supports':
      return 3;
    case 'weakens':
      return 4;
    case 'context_only':
      return 5;
    case 'mentions_without_evidence':
      return 6;
    case 'cannot_determine':
      return 7;
    case 'unrelated':
      return 8;
  }
}

function countVerdicts(claims: ClaimCaseFile[]): Partial<Record<ClaimVerdict, number>> {
  const counts: Partial<Record<ClaimVerdict, number>> = {};
  for (const c of claims) counts[c.verdict] = (counts[c.verdict] ?? 0) + 1;
  return counts;
}

function pickCaseTitle(title: string | null, text: string | null, url: string | null): string {
  if (title && title.trim()) return title.trim().slice(0, 180);
  if (text && text.trim()) return text.trim().slice(0, 180);
  if (url) return `Case file for ${url}`;
  return 'Evidence case file';
}

function stableCaseId(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `case_${(h >>> 0).toString(36)}`;
}

function dedupeText(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function verdictLabel(verdict: ClaimVerdict): string {
  switch (verdict) {
    case 'supported':
      return 'Supported';
    case 'partly_supported':
      return 'Partly supported';
    case 'unsupported':
      return 'Unsupported';
    case 'contradicted':
      return 'Contradicted';
    case 'misleading_framing':
      return 'Misleading framing';
    case 'unresolved':
      return 'Unresolved';
    case 'not_enough_evidence':
      return 'Not enough evidence';
    case 'not_fact_checkable':
      return 'Not fact-checkable';
    case 'context_only':
      return 'Context only';
  }
}

export function claimEvidenceStanceLabel(stance: ClaimEvidenceStance): string {
  switch (stance) {
    case 'directly_supports':
      return 'Directly supports';
    case 'partially_supports':
      return 'Partly supports';
    case 'contradicts':
      return 'Contradicts';
    case 'weakens':
      return 'Weakens';
    case 'context_only':
      return 'Context';
    case 'mentions_without_evidence':
      return 'Mentions only';
    case 'unrelated':
      return 'Unrelated';
    case 'cannot_determine':
      return 'Cannot determine';
  }
}

