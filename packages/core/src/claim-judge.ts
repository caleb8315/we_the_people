/**
 * Claim judge.
 *
 * The verify pipeline gathers evidence deterministically, but deciding
 * whether a source actually *reports* a claim is a reading task. Keyword
 * overlap cannot do it: an article about Trump's AI executive order shares
 * every important word with "Trump changed AI to superintelligence" and
 * supports none of it. This module hands the gathered evidence to a model
 * and asks for a yes/no answer grounded in that evidence.
 *
 * The model is never trusted blindly. `parseJudgment` rejects any "yes" that
 * does not cite a supporting source from the list it was given, and any
 * citation outside that list, so a confident hallucination falls back to
 * the deterministic answer instead of reaching a reader.
 */

import {
  describeAttempts,
  runAiCompletion,
  type AiCompletionOptions,
  type AiCompletionResult,
  type AiMessage,
} from './ai-provider';
import type {
  ClaimJudgment,
  JudgeAnswer,
  JudgeBasis,
  JudgedStance,
} from './case-file';
import type { EvidenceItem } from './types';
import type { RankedSource } from './source-ranking';

export interface JudgeEvidence {
  url: string;
  domain: string;
  title: string | null;
  excerpt: string | null;
  published_at: string | null;
  is_credible: boolean;
  role: RankedSource['role'] | null;
}

/** A "nobody reports it" answer needs enough coverage to mean something. */
export const MIN_EVIDENCE_FOR_NOT_REPORTED = 3;
const MAX_JUDGE_EVIDENCE = 16;
const EXCERPT_CHARS = 320;

const ANSWERS: readonly JudgeAnswer[] = ['yes', 'no', 'unclear'];
const BASES: readonly JudgeBasis[] = [
  'reported',
  'contradicted',
  'not_reported',
  'not_real',
  'conflicting',
  'no_coverage',
];
const STANCES: readonly JudgedStance[] = ['supports', 'contradicts', 'topic_only'];

const JUDGE_SYSTEM_PROMPT = `You are Crosscheck's claim judge. A reader wants a straight answer: is this claim true?

Answer with exactly one of: yes, no, unclear.

YES — at least one credible source below explicitly reports that the claimed thing happened or is true. You must cite it.
NO — any of:
  - credible sources report something that contradicts the claim (basis "contradicted");
  - the claim is about something notable that the coverage below would report if it had happened, and none of it does (basis "not_reported");
  - the claim misdescribes how things work or is not a real thing as stated (basis "not_real").
UNCLEAR — only when credible sources directly conflict with each other (basis "conflicting"), or nothing relevant was found at all (basis "no_coverage"). Do not use unclear just to be cautious. If the evidence leans clearly one way, commit to it.

Rules:
- A source that mentions the same people or topic is NOT support. Judge the exact claim, not a weaker version of it.
- If the claim is partly right (right event, wrong detail), answer NO and say what is actually true.
- Questions like "Did X do Y?" are claims that X did Y.
- You may use well-established general knowledge to interpret the claim, but a YES about a specific event must be backed by a cited source below.
- Write the headline in plain English. Start it with "Yes —" or "No —" for those answers, then say what actually happened in one sentence.
- Name outlets in the explanation. Never accuse anyone of lying.

Return only JSON, no prose around it:
{"answer":"yes|no|unclear","basis":"reported|contradicted|not_reported|not_real|conflicting|no_coverage","headline":"...","explanation":"2-3 sentences","evidence":[{"id":1,"stance":"supports|contradicts|topic_only"}]}

List every source you relied on in "evidence", using its [id].`;

/**
 * Pick the sources the judge reads: ranked order first, credible before
 * uncredible on ties, capped so the prompt stays small and fast.
 */
export function selectJudgeEvidence(
  evidence: EvidenceItem[],
  ranked: RankedSource[],
  limit = MAX_JUDGE_EVIDENCE,
): JudgeEvidence[] {
  const rankByUrl = new Map(ranked.map((r) => [r.url.toLowerCase(), r]));
  return evidence
    .filter((e) => e.title || e.excerpt)
    .map((e) => ({ e, ranked: rankByUrl.get(e.url.toLowerCase()) }))
    .sort((a, b) => {
      const rankDelta = (a.ranked?.rank ?? 999) - (b.ranked?.rank ?? 999);
      if (rankDelta !== 0) return rankDelta;
      return Number(b.e.is_credible) - Number(a.e.is_credible);
    })
    .slice(0, limit)
    .map(({ e, ranked: r }) => ({
      url: e.url,
      domain: e.domain,
      title: e.title,
      excerpt: e.excerpt,
      published_at: e.published_at,
      is_credible: e.is_credible,
      role: r?.role ?? null,
    }));
}

export function buildJudgeMessages(input: {
  claim: string;
  evidence: JudgeEvidence[];
  now?: Date;
}): AiMessage[] {
  const today = (input.now ?? new Date()).toISOString().slice(0, 10);
  const sources =
    input.evidence.length === 0
      ? 'No sources were found.'
      : input.evidence.map((e, i) => formatSource(e, i + 1)).join('\n');
  return [
    { role: 'system', content: JUDGE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `Today is ${today}.`,
        '',
        `Claim: ${input.claim.trim()}`,
        '',
        'Sources found:',
        sources,
      ].join('\n'),
    },
  ];
}

function formatSource(e: JudgeEvidence, id: number): string {
  const tags = [e.is_credible ? 'credible' : 'unrated', e.role].filter(Boolean).join(', ');
  const date = e.published_at ? ` ${e.published_at.slice(0, 10)}` : '';
  const excerpt = e.excerpt ? ` :: ${e.excerpt.replace(/\s+/g, ' ').slice(0, EXCERPT_CHARS)}` : '';
  return `[${id}] ${e.domain} (${tags})${date} — ${e.title ?? '(untitled)'}${excerpt}`;
}

/**
 * Validate a model reply. Returns null for anything that is not a usable,
 * evidence-grounded judgment.
 */
export function parseJudgment(
  text: string,
  evidence: JudgeEvidence[],
  meta: { provider: string; model: string | null },
): ClaimJudgment | null {
  const raw = extractJsonObject(text);
  if (!raw) return null;

  const answer = raw.answer;
  if (typeof answer !== 'string' || !ANSWERS.includes(answer as JudgeAnswer)) return null;
  let basis = raw.basis;
  if (typeof basis !== 'string' || !BASES.includes(basis as JudgeBasis)) return null;
  const headline = typeof raw.headline === 'string' ? raw.headline.trim() : '';
  if (!headline || headline.length > 400) return null;
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim().slice(0, 800) : '';

  const cited: ClaimJudgment['evidence'] = [];
  const seen = new Set<number>();
  for (const item of Array.isArray(raw.evidence) ? raw.evidence : []) {
    if (!item || typeof item !== 'object') continue;
    const { id, stance } = item as { id?: unknown; stance?: unknown };
    const index = typeof id === 'number' ? id : Number(id);
    if (!Number.isInteger(index) || index < 1 || index > evidence.length || seen.has(index)) continue;
    if (typeof stance !== 'string' || !STANCES.includes(stance as JudgedStance)) continue;
    seen.add(index);
    const source = evidence[index - 1]!;
    cited.push({ url: source.url, domain: source.domain, stance: stance as JudgedStance });
  }

  const supports = cited.filter((c) => c.stance === 'supports').length;
  const contradicts = cited.filter((c) => c.stance === 'contradicts').length;
  let finalAnswer = answer as JudgeAnswer;

  if (finalAnswer === 'yes' && (supports === 0 || basis !== 'reported')) return null;
  if (finalAnswer === 'no' && !['contradicted', 'not_reported', 'not_real'].includes(basis)) return null;
  if (finalAnswer === 'unclear' && !['conflicting', 'no_coverage'].includes(basis)) return null;
  if (basis === 'contradicted' && contradicts === 0) basis = 'not_reported';
  // Silence from a near-empty search is a search failure, not a denial.
  if (basis === 'not_reported' && evidence.length < MIN_EVIDENCE_FOR_NOT_REPORTED) {
    finalAnswer = 'unclear';
    basis = 'no_coverage';
  }

  return {
    answer: finalAnswer,
    basis: basis as JudgeBasis,
    headline: alignHeadline(headline, finalAnswer),
    explanation,
    evidence: cited,
    provider: meta.provider,
    model: meta.model,
  };
}

function alignHeadline(headline: string, answer: JudgeAnswer): string {
  const leadsYes = /^yes\b/i.test(headline);
  const leadsNo = /^no\b/i.test(headline);
  if (answer === 'yes') return leadsYes ? headline : `Yes — ${stripLead(headline)}`;
  if (answer === 'no') return leadsNo ? headline : `No — ${stripLead(headline)}`;
  return leadsYes || leadsNo ? stripLead(headline) : headline;
}

function stripLead(headline: string): string {
  const rest = headline.replace(/^(yes|no)\b[\s,.:;!—–-]*/i, '').trim() || headline;
  return rest.charAt(0).toLowerCase() + rest.slice(1);
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(unfenced.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface JudgeClaimResult {
  judgment: ClaimJudgment | null;
  /** Why there is no judgment, for logs. */
  reason?: 'no_claim' | 'no_providers_configured' | 'all_providers_failed' | 'invalid_response';
  attempts: ReturnType<typeof describeAttempts>;
}

/**
 * Ask each configured provider in turn until one returns a valid judgment.
 * Unlike plain completion fallback, a reply that fails validation also moves
 * on to the next provider. `budgetMs` bounds the total so a slow chain cannot
 * push the verify route past its function duration limit.
 */
export async function judgeClaim(input: {
  claim: string;
  evidence: JudgeEvidence[];
  providers: AiCompletionOptions['providers'];
  now?: Date;
  timeoutMs?: number;
  budgetMs?: number;
  complete?: (opts: AiCompletionOptions) => Promise<AiCompletionResult>;
}): Promise<JudgeClaimResult> {
  if (!input.claim.trim()) return { judgment: null, reason: 'no_claim', attempts: [] };
  const configured = input.providers.filter((p) => p.apiKey);
  if (configured.length === 0) {
    return { judgment: null, reason: 'no_providers_configured', attempts: [] };
  }

  const complete = input.complete ?? runAiCompletion;
  const messages = buildJudgeMessages({ claim: input.claim, evidence: input.evidence, now: input.now });
  const deadline = Date.now() + (input.budgetMs ?? 22_000);
  const attempts: JudgeClaimResult['attempts'] = [];
  let sawInvalid = false;

  for (const provider of configured) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;
    const result = await complete({
      providers: [provider],
      messages,
      temperature: 0,
      // Reasoning models spend part of this budget thinking before they answer.
      maxTokens: 1500,
      timeoutMs: Math.min(input.timeoutMs ?? 15_000, remaining),
    });
    attempts.push(...describeAttempts(result.attempts));
    if (!result.text || result.provider === 'skipped') continue;

    const judgment = parseJudgment(result.text, input.evidence, {
      provider: result.provider,
      model: result.model ?? null,
    });
    if (judgment) return { judgment, attempts };
    sawInvalid = true;
    attempts.push({ provider: result.provider, ok: false, model: result.model, error: 'invalid_judgment' });
  }

  return {
    judgment: null,
    reason: sawInvalid ? 'invalid_response' : 'all_providers_failed',
    attempts,
  };
}
