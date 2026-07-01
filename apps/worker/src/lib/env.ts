import 'dotenv/config';
import { z } from 'zod';

const emptyToUndef = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema);

const Env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  GEMINI_API_KEY: emptyToUndef(z.string().optional()),
  GROQ_API_KEY: emptyToUndef(z.string().optional()),

  RESEND_API_KEY: emptyToUndef(z.string().optional()),
  BREVO_API_KEY: emptyToUndef(z.string().optional()),
  BRIEFING_FROM_EMAIL: emptyToUndef(z.string().email().optional()),

  // Operator self-monitoring (job failure / crash alerts).
  ALERT_FROM_EMAIL: emptyToUndef(z.string().email().optional()),
  OPERATOR_ALERT_EMAIL: emptyToUndef(z.string().email().optional()),
  OPERATOR_ALERT_THROTTLE_MINUTES: emptyToUndef(z.coerce.number().int().positive().optional()),

  TELEGRAM_BOT_TOKEN: emptyToUndef(z.string().optional()),
  TELEGRAM_OPERATOR_CHAT_ID: emptyToUndef(z.string().optional()),

  // Phase 9 — base URL of the deployed web app. The `develop` cron job
  // calls `POST <WEB_APP_URL>/api/signal/<id>/develop` to enrich stale
  // developing signals, because the live corroboration fan-out's env
  // vars (Firecrawl / Brave / Bluesky) live in the web app, not here.
  WEB_APP_URL: emptyToUndef(z.string().url().optional()),
  WORKER_SHARED_SECRET: emptyToUndef(z.string().min(16).optional()),
});

let cached: z.infer<typeof Env> | null = null;

export function env(): z.infer<typeof Env> {
  if (cached) return cached;
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    console.error('[env] invalid worker environment:', parsed.error.flatten().fieldErrors);
    throw new Error('invalid environment');
  }
  cached = parsed.data;
  return cached;
}
