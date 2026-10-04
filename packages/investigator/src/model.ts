import { createGateway, type LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export interface ResolvedModels {
  /** Research + synthesis: needs strong tool use and long context. */
  main: LanguageModel;
  /** Planning / extraction: cheap and fast. */
  fast: LanguageModel;
  label: string;
  /** Gateway-only built-in web search tools are available. */
  gateway: ReturnType<typeof createGateway> | null;
}

type Env = Record<string, string | undefined>;

const GATEWAY_DEFAULT_MAIN = 'anthropic/claude-sonnet-5.5';
const GATEWAY_DEFAULT_FAST = 'google/gemini-3.8-flash';

/**
 * Pick models from whatever credentials are configured, in order of
 * preference. `INVESTIGATOR_MODEL` / `INVESTIGATOR_FAST_MODEL` override the
 * defaults (gateway slugs like "openai/gpt-6.1-sol", or bare provider ids
 * when using a direct provider key).
 */
export function resolveModels(env: Env = process.env): ResolvedModels | null {
  const mainOverride = env.INVESTIGATOR_MODEL?.trim() || null;
  const fastOverride = env.INVESTIGATOR_FAST_MODEL?.trim() || null;

  if (env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN) {
    const gateway = createGateway(env.AI_GATEWAY_API_KEY ? { apiKey: env.AI_GATEWAY_API_KEY } : {});
    const main = mainOverride ?? GATEWAY_DEFAULT_MAIN;
    const fast = fastOverride ?? GATEWAY_DEFAULT_FAST;
    return { main: gateway(main), fast: gateway(fast), label: `${main} via AI Gateway`, gateway };
  }

  if (env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const main = mainOverride ?? 'claude-sonnet-5-5';
    const fast = fastOverride ?? 'claude-haiku-4-5';
    return { main: anthropic(main), fast: anthropic(fast), label: `anthropic/${main}`, gateway: null };
  }

  if (env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    const main = mainOverride ?? 'gpt-6.1-sol';
    const fast = fastOverride ?? 'gpt-6-luna';
    return { main: openai(main), fast: openai(fast), label: `openai/${main}`, gateway: null };
  }

  const googleKey = env.GOOGLE_GENERATIVE_AI_API_KEY || env.GEMINI_API_KEY;
  if (googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    const main = mainOverride ?? 'gemini-3.8-flash';
    const fast = fastOverride ?? 'gemini-3.8-flash';
    return { main: google(main), fast: google(fast), label: `google/${main}`, gateway: null };
  }

  return null;
}

export function investigatorConfigured(env: Env = process.env): boolean {
  return Boolean(
    env.AI_GATEWAY_API_KEY ||
      env.VERCEL_OIDC_TOKEN ||
      env.ANTHROPIC_API_KEY ||
      env.OPENAI_API_KEY ||
      env.GOOGLE_GENERATIVE_AI_API_KEY ||
      env.GEMINI_API_KEY,
  );
}
