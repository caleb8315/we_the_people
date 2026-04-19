import { createHash } from 'node:crypto';

/**
 * Stable dedupe key for signals. Ignores source-specific noise so that
 * different outlets reporting the same event collapse to a single signal.
 */
export function makeDedupeKey(parts: {
  title: string;
  country_code?: string | null;
  occurred_at?: string | null;
  topic?: string | null;
}): string {
  const title = normalize(parts.title);
  const day = parts.occurred_at ? parts.occurred_at.slice(0, 10) : '';
  const country = (parts.country_code ?? '').toUpperCase();
  const topic = parts.topic ?? '';
  const raw = `${title}|${country}|${day}|${topic}`;
  return createHash('sha1').update(raw).digest('hex');
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'’“”]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .slice(0, 140);
}
