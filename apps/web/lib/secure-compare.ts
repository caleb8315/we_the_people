import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison for secrets (worker shared secret, tokens).
 *
 * A plain `a === b` short-circuits on the first differing byte, which leaks the
 * length of the matching prefix through response timing. `timingSafeEqual`
 * compares in constant time. We hard-fail on length mismatch first (the length
 * itself is not secret) and only call `timingSafeEqual` on equal-length
 * buffers, which is its precondition.
 *
 * Node-only: callers must run on the `nodejs` runtime.
 */
export function secureEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
