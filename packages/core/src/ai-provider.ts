/**
 * Shared AI provider abstraction (AI trust platform plan, capability 1).
 *
 * Goal: web routes (`/api/ai/chat`, `/api/briefings/generate`) and the
 * worker briefing job all converge on the same provider abstraction
 * with the same timeouts, retry policy, structured response shape, and
 * fail-closed behaviour. Before this module each callsite reimplemented
 * the fetch + JSON shape and they drifted (different timeouts, different
 * error handling, no consistent provider trace).
 *
 * This module is deliberately:
 *   - LLM-call-only (it does not touch budgets, daily limits, or
 *     grounding context — that stays at the call site).
 *   - Provider-agnostic at the type level (callers pass an explicit
 *     `providers` order).
 *   - Pure I/O (returns a structured result, never throws on provider
 *     failures — fail-closed is the caller's responsibility).
 */

export type AiProvider = 'gemini' | 'groq' | 'xay';
export type AiProviderResult = AiProvider | 'skipped';

export interface AiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AiCompletionOptions {
  /** Ordered list of providers to try. First success wins. */
  providers: Array<{ provider: AiProvider; apiKey: string | undefined; model?: string }>;
  /** OpenAI-style messages. Gemini callers receive a flattened `ROLE: text` prompt. */
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Per-call timeout. Defaults to 20s — long enough for cold starts, short enough for UI. */
  timeoutMs?: number;
}

export interface AiCompletionResult {
  text: string | null;
  provider: AiProviderResult;
  /** Model that produced `text`. Absent when no provider succeeded. */
  model?: string;
  /** Set when no provider returned text. Useful for ops surfaces. */
  reason?: string;
  /** Trace of provider attempts (success or failure). */
  attempts: Array<{
    provider: AiProvider;
    ok: boolean;
    status?: number;
    error?: string;
    /** Model actually sent, after retired-ID substitution. */
    model?: string;
  }>;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
export const DEFAULT_XAY_MODEL = 'gpt-4o-mini';

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: DEFAULT_GEMINI_MODEL,
  groq: DEFAULT_GROQ_MODEL,
  xay: DEFAULT_XAY_MODEL,
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_TEMPERATURE = 0.3;

/**
 * Model IDs the upstream providers have shut down.
 *
 * These return 404 forever, so a request naming one is guaranteed to fail.
 * They can still reach us from callers we do not control at deploy time —
 * `ai_profiles.model` rows written before the shutdown, or a `*_MODEL` env
 * override left stale in Vercel — so substitution happens here rather than
 * at each call site.
 *
 * Shutdown dates: Gemini 2.0 family 2026-06-01, Groq Llama IDs 2026-08-16.
 */
export const RETIRED_MODEL_IDS: ReadonlySet<string> = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'qwen/qwen3-32b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'mixtral-8x7b-32768',
]);

export function isRetiredModel(model: string | undefined | null): boolean {
  return !!model && RETIRED_MODEL_IDS.has(model);
}

/**
 * Pick the model to send: the caller's choice unless it names a shut-down ID,
 * in which case fall back to the provider default so the call can still work.
 */
export function resolveModel(provider: AiProvider, requested?: string): string {
  if (!requested || isRetiredModel(requested)) return DEFAULT_MODELS[provider];
  return requested;
}

/**
 * Run an AI completion against the configured provider chain.
 *
 * Behaviour:
 *   - Tries providers in order. A provider is skipped if its `apiKey` is
 *     missing or empty.
 *   - On HTTP error or timeout, records the attempt and falls through to
 *     the next provider.
 *   - Substitutes the provider default for any model ID the upstream has
 *     shut down, so stale stored/configured models degrade instead of 404.
 *   - Returns `{ text: null, provider: 'skipped' }` when nothing succeeded.
 *     Callers MUST treat that as a deterministic fallback signal — never
 *     show a generic "AI failed" string to readers.
 */
export async function runAiCompletion(
  opts: AiCompletionOptions,
): Promise<AiCompletionResult> {
  const attempts: AiCompletionResult['attempts'] = [];
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;

  for (const cfg of opts.providers) {
    if (!cfg.apiKey) {
      attempts.push({ provider: cfg.provider, ok: false, error: 'no_api_key' });
      continue;
    }
    const model = resolveModel(cfg.provider, cfg.model);
    try {
      const text = await dispatchProvider(cfg.provider, {
        apiKey: cfg.apiKey,
        model,
        messages: opts.messages,
        temperature,
        maxTokens,
        timeoutMs,
      });
      if (text && text.trim().length > 0) {
        attempts.push({ provider: cfg.provider, ok: true, model });
        return { text: text.trim(), provider: cfg.provider, model, attempts };
      }
      attempts.push({ provider: cfg.provider, ok: false, error: 'empty_response', model });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const status = err instanceof ProviderHttpError ? err.status : undefined;
      attempts.push({ provider: cfg.provider, ok: false, error, status, model });
    }
  }

  const allMissingKeys = attempts.length > 0 && attempts.every((a) => a.error === 'no_api_key');
  return {
    text: null,
    provider: 'skipped',
    reason:
      attempts.length === 0
        ? 'no_providers_configured'
        : allMissingKeys
          ? 'no_providers_configured'
          : 'all_providers_failed',
    attempts,
  };
}

/**
 * Render an attempt trace for logs.
 *
 * Provider error bodies can echo request content, so the message is truncated
 * and nothing else from the call (keys, prompts) is included.
 */
export function describeAttempts(
  attempts: AiCompletionResult['attempts'],
): Array<{ provider: string; ok: boolean; model?: string; status?: number; error?: string }> {
  return attempts.map(({ provider, ok, model, status, error }) => ({
    provider,
    ok,
    model,
    status,
    error: error?.slice(0, 300),
  }));
}

/** Carries the HTTP status through to the attempt trace. */
export class ProviderHttpError extends Error {
  constructor(
    readonly provider: AiProvider,
    readonly status: number,
    body: string,
  ) {
    super(`${provider} ${status}: ${body.slice(0, 200)}`);
    this.name = 'ProviderHttpError';
  }
}

interface DispatchInput {
  apiKey: string;
  model: string;
  messages: AiMessage[];
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

async function dispatchProvider(
  provider: AiProvider,
  input: DispatchInput,
): Promise<string> {
  switch (provider) {
    case 'gemini':
      return callGemini(input);
    case 'groq':
      return callGroq(input);
    case 'xay':
      return callXay(input);
  }
}

function buildGeminiPrompt(messages: AiMessage[]): string {
  return messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
}

/**
 * Gemini 3 dropped the sampling parameters; its migration guide tells callers
 * to strip `temperature`, `top_p`, and `top_k` from the generation config.
 */
export function geminiSupportsSamplingParams(model: string): boolean {
  const major = /^gemini-(\d+)/.exec(model);
  return major ? Number(major[1]) < 3 : true;
}

async function callGemini(input: DispatchInput): Promise<string> {
  const model = encodeURIComponent(input.model);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${input.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildGeminiPrompt(input.messages) }] }],
          generationConfig: {
            ...(geminiSupportsSamplingParams(input.model)
              ? { temperature: input.temperature }
              : {}),
            maxOutputTokens: input.maxTokens,
          },
        }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) {
      throw new ProviderHttpError('gemini', res.status, await res.text());
    }
    const j = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } finally {
    clearTimeout(timer);
  }
}

async function callGroq(input: DispatchInput): Promise<string> {
  return callOpenAiCompatible(
    'groq',
    'https://api.groq.com/openai/v1/chat/completions',
    input.model,
    input,
  );
}

async function callXay(input: DispatchInput): Promise<string> {
  return callOpenAiCompatible(
    'xay',
    'https://api.xay.ai/v1/chat/completions',
    input.model,
    input,
  );
}

async function callOpenAiCompatible(
  provider: 'groq' | 'xay',
  endpoint: string,
  model: string,
  input: DispatchInput,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new ProviderHttpError(provider, res.status, await res.text());
    }
    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return j.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}
