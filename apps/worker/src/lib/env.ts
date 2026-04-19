import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  BRIEFING_FROM_EMAIL: z.string().email().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_OPERATOR_CHAT_ID: z.string().optional(),
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
