import { tryConsume, type Bucket } from '@osint/core/budget';
import { env } from './env';
import { supabase } from './supabase';

/**
 * Minimal LLM client with budget-guard + provider fallback.
 * Gemini first (more generous free tier), Groq as secondary for structured
 * briefing generation.
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
  if (e.GEMINI_API_KEY) {
    try {
      return { text: await callGemini(prompt, e.GEMINI_API_KEY, opts), provider: 'gemini' };
    } catch (err) {
      console.warn('[llm] gemini failed, trying groq:', (err as Error).message);
    }
  }
  if (e.GROQ_API_KEY) {
    try {
      return { text: await callGroq(prompt, e.GROQ_API_KEY, opts), provider: 'groq' };
    } catch (err) {
      return { text: null, provider: 'skipped', reason: `groq failed: ${(err as Error).message}` };
    }
  }
  return { text: null, provider: 'skipped', reason: 'no llm key configured' };
}

async function callGemini(
  prompt: string,
  key: string,
  opts: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: opts.maxTokens ?? 800,
          temperature: opts.temperature ?? 0.4,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('gemini empty response');
  return text;
}

async function callGroq(
  prompt: string,
  key: string,
  opts: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0.4,
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('groq empty response');
  return text;
}
