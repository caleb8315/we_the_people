import { randomUUID } from 'node:crypto';
import {
  generateText,
  isStepCount,
  Output,
  pruneMessages,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { z } from 'zod';
import { SourceLedger, type LedgerEntry } from './ledger';
import { resolveModels, type ResolvedModels } from './model';
import { PLAN_INSTRUCTIONS, researchInstructions, SYNTHESIS_INSTRUCTIONS } from './prompts';
import {
  ReportDraftSchema,
  type InvestigationEvent,
  type InvestigationReport,
  type PhysicalCheck,
  type ReportDraft,
} from './schema';
import { buildTools, TOOL_LABELS } from './tools';
import type { Env, ToolContext } from './tools/context';
import { focusPassages, readUrl } from './tools/web';
import { scrubMarkers, verifyCitations } from './citations';
import { applyGuardrails } from './guardrails';
import { truncate } from './http';

export interface InvestigationInput {
  kind: 'text' | 'url';
  text?: string | null;
  url?: string | null;
}

export interface InvestigationOptions {
  emit?: (e: InvestigationEvent) => void;
  signal?: AbortSignal;
  env?: Env;
  /** Override resolved models (tests, evals). */
  models?: ResolvedModels;
  /** Overall wall-clock budget. Research stops early enough to leave time for the write-up. */
  budgetMs?: number;
  maxResearchSteps?: number;
  now?: Date;
}

export class InvestigatorNotConfiguredError extends Error {
  constructor() {
    super('No AI model is configured. Set AI_GATEWAY_API_KEY (recommended), ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.');
  }
}

const PlanSchema = z.object({
  claim_summary: z.string().describe('The submission restated as one neutral English sentence.'),
  original_language: z.string().describe('ISO 639-1 language of the submission'),
  atomic_claims: z
    .array(
      z.object({
        text: z.string(),
        type: z.enum(['event', 'statement', 'statistic', 'scientific', 'media', 'prediction', 'opinion']),
        places: z.array(z.string()),
        date_hint: z.string().nullable(),
        physical: z.boolean(),
      }),
    )
    .min(1)
    .max(6),
  regions: z
    .array(z.object({ country: z.string().describe('ISO 3166-1 alpha-2'), language: z.string().describe('ISO 639-1'), why: z.string() }))
    .max(8),
  search_queries: z.array(z.object({ language: z.string(), query: z.string() })).max(12),
  physical_checks: z.array(z.string()).max(6),
  competing_narratives: z.array(z.string()).max(6),
});
type Plan = z.infer<typeof PlanSchema>;

const MAX_SOURCES_IN_REPORT = 60;

export async function runInvestigation(
  input: InvestigationInput,
  options: InvestigationOptions = {},
): Promise<InvestigationReport> {
  const started = Date.now();
  const env = options.env ?? process.env;
  const models = options.models ?? resolveModels(env);
  if (!models) throw new InvestigatorNotConfiguredError();

  const emit = options.emit ?? (() => {});
  const budgetMs = options.budgetMs ?? 270_000;
  const deadline = started + budgetMs;
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const vision = env.INVESTIGATOR_VISION !== 'false';
  const maxSteps = options.maxResearchSteps ?? Number(env.INVESTIGATOR_MAX_STEPS ?? 28);

  const ledger = new SourceLedger();
  ledger.onChange((entry, isNew) => {
    if (isNew) emit({ type: 'source', source: ledger.toPublic(entry) });
  });
  const ctx: ToolContext = {
    ledger,
    physical: [],
    emit,
    env,
    signal: options.signal,
    stats: new Map(),
    languages: new Set(),
    countries: new Set(),
  };

  // ── 1. Intake ────────────────────────────────────────────────────────────
  emit({ type: 'phase', phase: 'intake', message: input.kind === 'url' ? 'Reading the submitted link…' : 'Reading the claim…' });
  let claimText = (input.text ?? '').trim();
  let submitted: LedgerEntry | null = null;
  if (input.kind === 'url' && input.url) {
    const article = await readUrl(input.url, env, options.signal).catch(() => null);
    submitted = ledger.add({
      url: article?.url ?? input.url,
      title: article?.title ?? null,
      outlet: article?.siteName ?? null,
      published_at: article?.publishedTime ?? null,
      language: article?.lang ?? null,
      snippet: article ? truncate(article.text, 300) : null,
      text: article?.text ?? null,
      retrieved_via: 'Submitted link',
    });
    claimText = [claimText, article?.title, article ? truncate(article.text, 2500) : null].filter(Boolean).join('\n\n');
    if (!article) {
      emit({ type: 'note', message: 'The link could not be read directly; investigating from its address and any text provided.' });
      claimText = claimText || input.url;
    }
  }
  if (!claimText) throw new Error('Nothing to investigate: provide a claim or a readable link.');

  // ── 2. Plan ──────────────────────────────────────────────────────────────
  emit({ type: 'phase', phase: 'plan', message: 'Breaking the claim into checkable parts and choosing where to look…' });
  const plan = await makePlan(models.fast, claimText, today, options.signal);
  for (const r of plan.regions) {
    ctx.countries.add(r.country.toUpperCase());
    ctx.languages.add(r.language.toLowerCase());
  }
  emit({
    type: 'plan',
    claims: plan.atomic_claims.map((c) => c.text),
    languages: [...new Set(plan.regions.map((r) => r.language.toLowerCase()))],
    places: [...new Set(plan.atomic_claims.flatMap((c) => c.places))],
  });

  // ── 3. Research ──────────────────────────────────────────────────────────
  emit({ type: 'phase', phase: 'research', message: 'Investigating across global news, fact-checks, and sensor data…' });
  const tools: ToolSet = buildTools(ctx, { vision });
  if (models.gateway && env.INVESTIGATOR_GATEWAY_SEARCH !== 'false') {
    tools.exa_search = models.gateway.tools.exaSearch({ numResults: 8, contents: { highlights: true } }) as ToolSet[string];
  }
  const researchDeadline = deadline - 75_000;
  const researchNotes = await research({
    model: models.main,
    tools,
    ctx,
    plan,
    claimText,
    submitted,
    today,
    vision,
    maxSteps,
    researchDeadline,
    signal: options.signal,
  });

  // ── 4. Synthesis ─────────────────────────────────────────────────────────
  emit({ type: 'phase', phase: 'synthesis', message: `Weighing ${ledger.size} sources and writing the verdict…` });
  const draft = await synthesize(models, ctx, plan, claimText, researchNotes, options.signal);

  // ── 5. Verification ─────────────────────────────────────────────────────
  emit({ type: 'phase', phase: 'verification', message: 'Checking every quote against the original sources…' });
  const report = finalize({ draft, ctx, input, models, started, submitted });
  emit({ type: 'phase', phase: 'done', message: 'Investigation complete.' });
  emit({ type: 'report', report });
  return report;
}

async function makePlan(model: LanguageModel, claimText: string, today: string, signal?: AbortSignal): Promise<Plan> {
  try {
    const { output } = await generateText({
      model,
      instructions: PLAN_INSTRUCTIONS,
      prompt: `Today: ${today}\n\nSUBMISSION:\n${truncate(claimText, 6000)}`,
      output: Output.object({ schema: PlanSchema, name: 'InvestigationPlan' }),
      abortSignal: signal,
      maxRetries: 1,
    });
    return output;
  } catch {
    return {
      claim_summary: truncate(claimText, 300),
      original_language: 'en',
      atomic_claims: [{ text: truncate(claimText, 300), type: 'event', places: [], date_hint: null, physical: false }],
      regions: [],
      search_queries: [{ language: 'en', query: truncate(claimText, 120) }],
      physical_checks: [],
      competing_narratives: [],
    };
  }
}

interface ResearchArgs {
  model: LanguageModel;
  tools: ToolSet;
  ctx: ToolContext;
  plan: Plan;
  claimText: string;
  submitted: LedgerEntry | null;
  today: string;
  vision: boolean;
  maxSteps: number;
  researchDeadline: number;
  signal?: AbortSignal;
}

async function research(a: ResearchArgs): Promise<string> {
  const { ctx } = a;
  const prompt = [
    `CLAIM UNDER INVESTIGATION:\n${truncate(a.claimText, 5000)}`,
    a.submitted ? `The submitted link is ledger source ${a.submitted.id} (${a.submitted.outlet}).` : null,
    `PLAN (from the planning stage — improve on it if needed):\n${JSON.stringify(a.plan, null, 1)}`,
    'Begin the investigation now.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const hasWebSearch = Boolean(ctx.env.BRAVE_SEARCH_API_KEY || ctx.env.EXA_API_KEY || ctx.env.FIRECRAWL_API_KEY || a.tools.exa_search);
  try {
    const result = await generateText({
      model: a.model,
      instructions: researchInstructions({ maxSteps: a.maxSteps, today: a.today, vision: a.vision, hasWebSearch }),
      prompt,
      tools: a.tools,
      stopWhen: [isStepCount(a.maxSteps), () => Date.now() > a.researchDeadline],
      abortSignal: a.signal,
      maxRetries: 2,
      prepareStep: ({ messages }) => {
        if (estimateTokens(messages) > 110_000) {
          return {
            messages: pruneMessages({ messages, reasoning: 'all', toolCalls: 'before-last-6-messages', emptyMessages: 'remove' }),
          };
        }
        return undefined;
      },
      onToolExecutionStart: ({ toolCall }) => {
        const label = TOOL_LABELS[toolCall.toolName]?.((toolCall.input ?? {}) as Record<string, unknown>) ?? toolCall.toolName;
        ctx.emit({ type: 'tool_start', id: toolCall.toolCallId, tool: toolCall.toolName, label });
      },
      onToolExecutionEnd: ({ toolCall, toolOutput }) => {
        const ok = toolOutput.type !== 'tool-error';
        ctx.emit({
          type: 'tool_end',
          id: toolCall.toolCallId,
          tool: toolCall.toolName,
          ok,
          summary: ok ? summarizeToolOutput(toolOutput.output) : 'Failed',
        });
      },
      onStepEnd: (step) => {
        for (const tr of step.toolResults ?? []) {
          if (tr.toolName === 'exa_search' || tr.toolName === 'perplexity_search') {
            const hits = harvestUrls((tr as { output?: unknown }).output);
            for (const h of hits) {
              ctx.ledger.add({ url: h.url, title: h.title, snippet: h.text, text: h.text, retrieved_via: 'Web search (Exa)' });
            }
            ctx.emit({ type: 'tool_end', id: tr.toolCallId, tool: tr.toolName, ok: true, summary: `${hits.length} results` });
          }
        }
      },
    });
    return result.text?.trim() || 'Research stopped at the time budget before notes were written; rely on the sources and physical checks below.';
  } catch (err) {
    if (a.signal?.aborted) throw err;
    ctx.emit({ type: 'note', message: 'The research stage hit an error; writing the report from evidence gathered so far.' });
    return `Research ended early (${err instanceof Error ? err.message : 'error'}). Use the sources and physical checks gathered so far.`;
  }
}

function estimateTokens(messages: ModelMessage[]): number {
  const json = JSON.stringify(messages, (_k, v) => (typeof v === 'string' && v.length > 20_000 ? '' : v));
  return Math.round(json.length / 4);
}

function summarizeToolOutput(output: unknown): string {
  if (!output || typeof output !== 'object') return 'Done';
  const o = output as Record<string, unknown>;
  if (typeof o.error === 'string') return o.error;
  if (o.unavailable) return 'Not configured';
  if (typeof o.observation === 'string') return o.observation;
  if (Array.isArray(o.results)) return `${o.results.length} results`;
  if (typeof o.text === 'string') return `Read ${typeof o.outlet === 'string' ? o.outlet : 'source'} (${Math.round(o.text.length / 100) / 10}k chars)`;
  if (typeof o.label === 'string') return o.label;
  return 'Done';
}

/** Walk an arbitrary provider-tool payload and pull out {url,title,text} records. */
export function harvestUrls(output: unknown): Array<{ url: string; title: string | null; text: string | null }> {
  const out: Array<{ url: string; title: string | null; text: string | null }> = [];
  const visit = (v: unknown, depth: number) => {
    if (!v || depth > 6 || out.length >= 20) return;
    if (Array.isArray(v)) {
      v.forEach((x) => visit(x, depth + 1));
      return;
    }
    if (typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.url === 'string' && /^https?:\/\//.test(o.url)) {
      const highlights = Array.isArray(o.highlights) ? (o.highlights as unknown[]).filter((x) => typeof x === 'string').join(' … ') : null;
      const text = (typeof o.text === 'string' && o.text) || highlights || (typeof o.snippet === 'string' && o.snippet) || null;
      out.push({ url: o.url, title: typeof o.title === 'string' ? o.title : null, text: text ? text.slice(0, 20_000) : null });
      return;
    }
    Object.values(o).forEach((x) => visit(x, depth + 1));
  };
  visit(output, 0);
  return out;
}

function evidenceDossier(ctx: ToolContext, claimText: string): string {
  const focus = claimText.slice(0, 400);
  const entries = ctx.ledger.all();
  const read = entries.filter((e) => e.text && e.text.length > 0).slice(0, 18);
  const unread = entries.filter((e) => !e.text).slice(0, 70);
  const header = (e: LedgerEntry) =>
    `[${e.id}] ${e.outlet} | ${e.domain} | ownership: ${e.ownership}${e.ownership_note ? ` (${e.ownership_note})` : ''} | country: ${e.country ?? '?'} | lang: ${e.language ?? '?'} | date: ${e.published_at?.slice(0, 10) ?? '?'} | via: ${e.retrieved_via}\nTitle: ${e.title ?? '(none)'}`;
  const readBlocks = read.map((e) => `${header(e)}\nTEXT (excerpts):\n${focusPassages(e.text!, focus, 2600)}`);
  const unreadBlocks = unread.map((e) => `${header(e)}\nSnippet: ${e.snippet ?? '(none)'}`);
  return [
    `SOURCES READ IN FULL (${read.length}):`,
    ...readBlocks,
    `\nSOURCES SEEN IN SEARCH RESULTS ONLY (${unread.length}) — only the title/snippet can be quoted:`,
    ...unreadBlocks,
  ].join('\n\n');
}

function physicalDossier(physical: PhysicalCheck[]): string {
  if (!physical.length) return 'No physical/sensor checks were run.';
  return physical
    .map((p) => `[${p.id}] ${p.kind} at ${p.place ?? `${p.lat}, ${p.lon}`} (${p.window?.start ?? '?'}–${p.window?.end ?? '?'}) via ${p.data_sources.join(', ')}: ${p.observation}`)
    .join('\n');
}

async function synthesize(
  models: ResolvedModels,
  ctx: ToolContext,
  plan: Plan,
  claimText: string,
  notes: string,
  signal?: AbortSignal,
): Promise<ReportDraft> {
  const prompt = [
    `CLAIM:\n${truncate(claimText, 4000)}`,
    `PLANNED SUB-CLAIMS:\n${plan.atomic_claims.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}`,
    `RESEARCH NOTES:\n${truncate(notes, 12_000)}`,
    `PHYSICAL CHECKS:\n${physicalDossier(ctx.physical)}`,
    evidenceDossier(ctx, `${plan.claim_summary} ${claimText}`),
  ].join('\n\n---\n\n');

  const attempt = async (model: LanguageModel) => {
    const { output } = await generateText({
      model,
      instructions: SYNTHESIS_INSTRUCTIONS,
      prompt,
      output: Output.object({ schema: ReportDraftSchema, name: 'InvestigationReport' }),
      abortSignal: signal,
      maxRetries: 1,
    });
    return output;
  };
  try {
    return await attempt(models.main);
  } catch (err) {
    if (signal?.aborted) throw err;
    return await attempt(models.fast);
  }
}

function finalize(args: {
  draft: ReportDraft;
  ctx: ToolContext;
  input: InvestigationInput;
  models: ResolvedModels;
  started: number;
  submitted: LedgerEntry | null;
}): InvestigationReport {
  const { draft, ctx } = args;
  const { ledger } = ctx;

  let checked = 0;
  let removed = 0;
  const claims = draft.claims.map((c) => {
    const result = verifyCitations(c.citations, ledger);
    checked += c.citations.length;
    removed += result.removed.length;
    return { text: c.text, verdict: c.verdict, explanation: c.explanation, citations: result.kept };
  });

  const physicalWithInterpretation: PhysicalCheck[] = ctx.physical.map((p) => {
    const finding = draft.physical_check_findings.find((f) => f.check_id.toUpperCase() === p.id);
    return finding ? { ...p, result: finding.result, interpretation: finding.interpretation } : p;
  });

  const guard = applyGuardrails({
    verdict: draft.verdict,
    confidence: draft.confidence,
    claims,
    physical: physicalWithInterpretation,
    ledger,
    citationsRemoved: removed,
    citationsChecked: checked,
  });

  const validId = (id: string | null) => (id && ledger.get(id.toUpperCase()) ? id.toUpperCase() : null);
  const citedIds = new Set<string>([
    ...guard.claims.flatMap((c) => c.citations.map((x) => x.source_id)),
    ...draft.sides.flatMap((s) => s.source_ids.map((x) => x.toUpperCase())),
    ...draft.manipulation_techniques.flatMap((m) => m.source_ids.map((x) => x.toUpperCase())),
    ...[...draft.what_is_true.matchAll(/S\d+/g)].map((m) => m[0]),
  ]);
  if (args.submitted) citedIds.add(args.submitted.id);
  const ordered = [
    ...ledger.all().filter((e) => citedIds.has(e.id)),
    ...ledger.all().filter((e) => !citedIds.has(e.id) && e.read_full_text),
    ...ledger.all().filter((e) => !citedIds.has(e.id) && !e.read_full_text),
  ].slice(0, MAX_SOURCES_IN_REPORT);

  const tools = [...ctx.stats.entries()].map(([tool, s]) => ({ tool, calls: s.calls, results: s.results }));
  return {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    input: { kind: args.input.kind, text: args.input.text ?? null, url: args.input.url ?? null },
    headline_claim: draft.headline_claim,
    verdict: guard.verdict,
    confidence: guard.confidence,
    confidence_reason: draft.confidence_reason,
    bottom_line: scrubMarkers(draft.bottom_line, ledger),
    is_it_fake: draft.is_it_fake,
    conspiracy: draft.conspiracy,
    what_is_true: scrubMarkers(draft.what_is_true, ledger),
    claims: guard.claims.map((c) => ({ ...c, explanation: scrubMarkers(c.explanation, ledger) })),
    sides: draft.sides.map((s) => ({ ...s, source_ids: s.source_ids.map((x) => x.toUpperCase()).filter((id) => ledger.get(id)) })),
    origin: { ...draft.origin, earliest_source_id: validId(draft.origin.earliest_source_id) },
    manipulation_techniques: draft.manipulation_techniques.map((m) => ({
      ...m,
      source_ids: m.source_ids.map((x) => x.toUpperCase()).filter((id) => ledger.get(id)),
    })),
    physical_checks: guard.physical,
    open_questions: draft.open_questions,
    sources: ordered.map((e) => ledger.toPublic(e)),
    coverage: {
      languages: [...new Set([...ctx.languages, ...ledger.all().map((e) => e.language).filter((l): l is string => Boolean(l))])].sort(),
      countries: [...ctx.countries].sort(),
      tools,
      sources_found: ledger.size,
      sources_read: ledger.all().filter((e) => e.read_full_text).length,
      independent_outlets: guard.independentOutlets,
    },
    integrity: {
      citations_checked: checked,
      citations_verified: checked - removed,
      citations_removed: removed,
      guardrails: guard.notes,
    },
    model: args.models.label,
    duration_ms: Date.now() - args.started,
  };
}
