/**
 * Shared AI provider abstraction (AI trust platform plan, capability 1).
 *
 * Goal: web routes (`/api/ai/chat`, `/api/briefings/generate`) and the
 * worker briefing job all converge on the same Gemini → Groq fallback
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

export type AiProvider = 'gemini' | 'groq';
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
  /** Set when no provider returned text. Useful for ops surfaces. */
  reason?: string;
  /** Trace of provider attempts (success or failure). */
  attempts: Array<{ provider: AiProvider; ok: boolean; status?: number; error?: string }>;
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_TEMPERATURE = 0.3;

/**
 * Run an AI completion against the configured provider chain.
 *
 * Behaviour:
 *   - Tries providers in order. A provider is skipped if its `apiKey` is
 *     missing or empty.
 *   - On HTTP error or timeout, records the attempt and falls through to
 *     the next provider.
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
    try {
      const text = await dispatchProvider(cfg.provider, {
        apiKey: cfg.apiKey,
        model: cfg.model,
        messages: opts.messages,
        temperature,
        maxTokens,
        timeoutMs,
      });
      if (text && text.trim().length > 0) {
        attempts.push({ provider: cfg.provider, ok: true });
        return { text: text.trim(), provider: cfg.provider, attempts };
      }
      attempts.push({ provider: cfg.provider, ok: false, error: 'empty_response' });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      attempts.push({ provider: cfg.provider, ok: false, error });
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

interface DispatchInput {
  apiKey: string;
  model?: string;
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
  }
}

function buildGeminiPrompt(messages: AiMessage[]): string {
  return messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
}

async function callGemini(input: DispatchInput): Promise<string> {
  const model = encodeURIComponent(input.model ?? DEFAULT_GEMINI_MODEL);
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
            temperature: input.temperature,
            maxOutputTokens: input.maxTokens,
          },
        }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) {
      throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model ?? DEFAULT_GROQ_MODEL,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return j.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}
