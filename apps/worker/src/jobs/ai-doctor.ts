import {
  DEFAULT_MODELS,
  isRetiredModel,
  resolveModel,
  runAiCompletion,
  type AiProvider,
} from '@osint/core/ai-provider';
import { env } from '../lib/env';

/**
 * Provider self-check.
 *
 * Every AI surface falls back to deterministic copy when a provider fails, so
 * a broken key or a shut-down model looks identical to "the AI is quiet" from
 * the outside. This sends one cheap real completion per configured provider
 * and reports what each one actually returned.
 *
 * Deliberately bypasses the `usage_ledger` budget: a diagnostic must still
 * work once the daily cap is spent, which is itself a cause of silent skips.
 *
 *   npm run ai:doctor
 */

const PROBE_PROMPT = 'Reply with the single word: ok';

interface ProbeResult {
  provider: AiProvider;
  model: string;
  configured: boolean;
  ok: boolean;
  status?: number;
  detail: string;
  latencyMs?: number;
}

export async function runAiDoctor(): Promise<ProbeResult[]> {
  const e = env();
  const legs: Array<{ provider: AiProvider; apiKey?: string; model?: string }> = [
    { provider: 'xay', apiKey: e.XAY_API_KEY, model: e.XAY_MODEL },
    { provider: 'groq', apiKey: e.GROQ_API_KEY, model: e.GROQ_MODEL },
    { provider: 'gemini', apiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL },
  ];

  const results: ProbeResult[] = [];

  for (const leg of legs) {
    const model = resolveModel(leg.provider, leg.model);

    if (!leg.apiKey) {
      results.push({
        provider: leg.provider,
        model,
        configured: false,
        ok: false,
        detail: `${leg.provider.toUpperCase()}_API_KEY is not set — this provider is skipped at runtime`,
      });
      continue;
    }

    const startedAt = Date.now();
    // One provider per call so a failure is attributed, not absorbed by the chain.
    const result = await runAiCompletion({
      providers: [{ provider: leg.provider, apiKey: leg.apiKey, model: leg.model }],
      messages: [{ role: 'user', content: PROBE_PROMPT }],
      maxTokens: 16,
      temperature: 0,
    });
    const latencyMs = Date.now() - startedAt;
    const attempt = result.attempts[0];

    results.push({
      provider: leg.provider,
      model,
      configured: true,
      ok: Boolean(result.text),
      status: attempt?.status,
      latencyMs,
      detail: result.text
        ? `replied ${JSON.stringify(result.text.slice(0, 60))}`
        : (attempt?.error ?? result.reason ?? 'unknown failure'),
    });
  }

  report(results, legs);
  return results;
}

const CHAT_PROVIDER_ORDER: AiProvider[] = ['gemini', 'groq', 'xay'];

function chatOrder(provider: AiProvider): number {
  return CHAT_PROVIDER_ORDER.indexOf(provider);
}

function report(
  results: ProbeResult[],
  legs: Array<{ provider: AiProvider; model?: string }>,
): void {
  console.log('\nAI provider self-check\n');

  for (const r of results) {
    const mark = r.ok ? 'PASS' : r.configured ? 'FAIL' : 'SKIP';
    const timing = r.latencyMs !== undefined ? ` ${r.latencyMs}ms` : '';
    const status = r.status ? ` HTTP ${r.status}` : '';
    console.log(`  [${mark}] ${r.provider.padEnd(6)} ${r.model}${status}${timing}`);
    console.log(`         ${r.detail}`);
  }

  for (const leg of legs) {
    if (isRetiredModel(leg.model)) {
      console.log(
        `\n  note: ${leg.provider.toUpperCase()}_MODEL is set to "${leg.model}", which the provider has shut down.` +
          `\n        Requests fell back to ${DEFAULT_MODELS[leg.provider]}. Clear or update the override.`,
      );
    }
  }

  const working = results.filter((r) => r.ok);
  const configured = results.filter((r) => r.configured);
  // Briefings try xay -> groq -> gemini; chat tries gemini -> groq -> xay.
  const briefingWinner = working[0];
  const chatWinner = [...working].sort((a, b) => chatOrder(a.provider) - chatOrder(b.provider))[0];

  console.log('');
  if (briefingWinner && chatWinner) {
    console.log(`  ${working.length}/${configured.length} configured provider(s) working.`);
    console.log(`  Briefings will use: ${briefingWinner.provider}.`);
    console.log(`  Analyst chat will use: ${chatWinner.provider}.`);
  } else if (configured.length === 0) {
    console.log('  No provider keys are set. Every AI surface falls back to deterministic copy.');
    console.log('  Set at least one of GEMINI_API_KEY, GROQ_API_KEY, or XAY_API_KEY.');
  } else {
    console.log('  No provider is working. Every AI surface falls back to deterministic copy.');
    console.log('  A 404 usually means a shut-down model ID; a 401/403 means a bad or revoked key.');
  }
  console.log('');
}
