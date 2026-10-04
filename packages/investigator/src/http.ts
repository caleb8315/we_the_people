const UA = 'Crosscheck-Investigator/1.0 (+https://crosscheck.news; truth-verification research)';

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
  signal?: AbortSignal;
}

/** Per-host minimum spacing between requests (public APIs with published limits). */
const HOST_SPACING_MS: Record<string, number> = {
  'api.gdeltproject.org': 5_200,
  'nominatim.openstreetmap.org': 1_100,
  'query.wikidata.org': 500,
};
const hostQueues = new Map<string, Promise<void>>();

async function throttle(url: string): Promise<void> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  const spacing = HOST_SPACING_MS[host];
  if (!spacing) return;
  const prev = hostQueues.get(host) ?? Promise.resolve();
  const next = prev.then(() => new Promise<void>((r) => setTimeout(r, spacing)));
  hostQueues.set(host, next);
  await prev;
}

export async function httpFetch(url: string, opts: FetchOptions = {}): Promise<Response | null> {
  await throttle(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, {
      method: opts.method ?? 'GET',
      headers: { 'user-agent': UA, ...opts.headers },
      body: opts.body,
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T | null> {
  const res = await httpFetch(url, { ...opts, headers: { accept: 'application/json', ...opts.headers } });
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<{ text: string; contentType: string; finalUrl: string } | null> {
  const res = await httpFetch(url, opts);
  if (!res || !res.ok) return null;
  try {
    const text = await res.text();
    return { text, contentType: res.headers.get('content-type') ?? '', finalUrl: res.url || url };
  } catch {
    return null;
  }
}

export function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '';
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

export function stripTags(s: string): string {
  return decodeEntities(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * GDELT's free API answers 429 with a plain-text notice when its per-IP
 * limit is hit (shared cloud IPs hit it often). Back off and retry.
 */
export async function gdeltRequest(url: string, signal?: AbortSignal): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await httpFetch(url, { timeoutMs: 25_000, signal });
    if (!res) return { ok: false, reason: 'GDELT did not respond (its free API is often slow).' };
    const text = await res.text().catch(() => '');
    if (res.status === 429 || text.startsWith('Please limit requests')) {
      if (signal?.aborted) break;
      await new Promise((r) => setTimeout(r, 6_000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) return { ok: false, reason: `GDELT returned HTTP ${res.status}.` };
    return { ok: true, text };
  }
  return { ok: false, reason: 'GDELT is rate-limiting this server right now; use google_news_search or web_search instead.' };
}
