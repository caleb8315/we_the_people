import { z } from 'zod';

/** Treats "" as undefined so empty lines in .env don't fail validation. */
const emptyToUndef = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema);

const PublicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: emptyToUndef(z.string().url().optional()),
});

const ServerEnv = PublicEnv.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  GEMINI_API_KEY: emptyToUndef(z.string().optional()),
  GROQ_API_KEY: emptyToUndef(z.string().optional()),
  UPSTASH_REDIS_REST_URL: emptyToUndef(z.string().url().optional()),
  UPSTASH_REDIS_REST_TOKEN: emptyToUndef(z.string().optional()),
  WORKER_SHARED_SECRET: emptyToUndef(z.string().min(16).optional()),
  ADMIN_EMAILS: emptyToUndef(z.string().optional()),
});

export function publicEnv() {
  return PublicEnv.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}

export function serverEnv() {
  const parsed = ServerEnv.safeParse(process.env);
  if (!parsed.success) {
    console.error('[env] server misconfigured:', parsed.error.flatten().fieldErrors);
    throw new Error('invalid server env: ' + JSON.stringify(parsed.error.flatten().fieldErrors));
  }
  return parsed.data;
}
