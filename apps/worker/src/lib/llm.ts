import { tryConsume, type Bucket } from '@osint/core/budget';
import { runAiCompletion, type AiMessage } from '@osint/core/ai-provider';
import { env } from './env';
import { supabase } from './supabase';

/**
 * Worker LLM client.
 *
 * Uses the shared `@osint/core/ai-provider` so that the worker briefing
 * pipeline, the on-demand `/api/briefings/generate` route, and the AI
 * chat route all behave identically (Gemini → Groq fallback, same
 * timeouts, same error trace). Budget enforcement is the worker's job:
 * if `tryConsume` denies the call we never hit the network.
 *
 * Fail-closed: a missing key, HTTP error, or empty response returns
 * `{ text: null, provider: 'skipped' }` and the caller falls back to
 * deterministic copy. We never surface a generic "AI failed" string to
 * readers.
 */

export interface LlmResult {
  text: string | null;
  provider: 'gemini' | 'groq' | 'skipped';
  reason?: string;
}

export async function callLlm(
  prompt: string,
  opts: { bucket: Bucket; maxTokens?: number; temperature?: number } = { bucket: 'signals' },
): Promise<LlmResult> {
  const budget = await tryConsume(supabase(), opts.bucket);
  if (!budget.ok) return { text: null, provider: 'skipped', reason: budget.reason };

  const e = env();
  const messages: AiMessage[] = [{ role: 'user', content: prompt }];
  const result = await runAiCompletion({
    providers: [
      { provider: 'gemini', apiKey: e.GEMINI_API_KEY },
      { provider: 'groq', apiKey: e.GROQ_API_KEY },
    ],
    messages,
    maxTokens: opts.maxTokens ?? 800,
    temperature: opts.temperature ?? 0.4,
  });
  return {
    text: result.text,
    provider: result.provider,
    reason: result.reason,
  };
}
