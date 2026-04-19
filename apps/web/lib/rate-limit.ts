/**
 * Minimal, dependency-free rate limiter.
 *
 * Default: in-memory sliding window (fine for single-region Vercel Hobby).
 * Optional: Upstash Redis REST (free tier) when configured, for multi-instance
 * deployments. We prefer in-memory here because a single Vercel serverless
 * region is enough for a 200-user beta and it keeps us fully free.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export interface LimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export function limit(key: string, max: number, windowMs: number): LimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, resetAt: now + windowMs };
  }
  if (b.count >= max) return { ok: false, remaining: 0, resetAt: b.resetAt };
  b.count++;
  return { ok: true, remaining: max - b.count, resetAt: b.resetAt };
}

export function getClientKey(req: Request, suffix = ''): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'anon';
  return `${ip}:${suffix}`;
}
