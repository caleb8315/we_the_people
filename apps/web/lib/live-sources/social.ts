/**
 * Live social-media corroboration.
 *
 * Reddit and Bluesky both expose public read-only search APIs that need
 * no OAuth and no key — we just need a polite User-Agent. This module
 * queries both in parallel at verify-time so the user sees what's being
 * said about the event in public social discourse RIGHT NOW, independent
 * of whether our ingest worker has caught up yet.
 *
 * All returned evidence is marked `is_credible: false` — social posts are
 * noise signal, not primary reporting. The outer confidence engine already
 * caps social-only submissions at the `medium` band; we rely on that.
 */

import { extractDomain, type EvidenceItem } from '@osint/core';
import type { SourceQuery, SourceResult, SourceSearcher } from './types';

const UA = 'Crosscheck-Verify/1.0 (+https://crosscheck.app)';
const TIMEOUT_MS = 4_500;

export const searchReddit: SourceSearcher = async (q) => {
  const query = pickQuery(q);
  if (!query) {
    return { id: 'reddit', name: 'Reddit', status: 'skipped', hits: 0, note: 'No query text.', evidence: [] };
  }
  try {
    // Reddit started aggressively blocking anonymous datacenter IPs (including
    // Vercel) in 2024/2025 — we nearly always 403 from serverless. If a
    // REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET pair is configured (free app at
    // https://www.reddit.com/prefs/apps — choose "script" type, no user login
    // required) we use the authenticated oauth.reddit.com host. Otherwise we
    // attempt the anonymous endpoint but treat the inevitable 403 as
    // `unavailable` with actionable setup instructions, not a generic error.
    const oauthToken = await getRedditAccessToken().catch(() => null);
    const endpoint = oauthToken
      ? 'https://oauth.reddit.com/search.json'
      : 'https://www.reddit.com/search.json';

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const url = new URL(endpoint);
    url.searchParams.set('q', query.slice(0, 200));
    url.searchParams.set('limit', '10');
    url.searchParams.set('sort', 'relevance');
    url.searchParams.set('t', 'month');
    url.searchParams.set('raw_json', '1');

    const headers: Record<string, string> = { 'user-agent': UA, accept: 'application/json' };
    if (oauthToken) headers.authorization = `Bearer ${oauthToken}`;

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (!res) {
      return err('reddit', 'Reddit', 'Reddit request timed out.');
    }
    // 403/401/429 from anonymous search is the expected norm on cloud
    // hosts. Degrade to `unavailable` with actionable setup copy rather
    // than pretending Crosscheck is broken.
    if ((res.status === 401 || res.status === 403 || res.status === 429) && !oauthToken) {
      return {
        id: 'reddit',
        name: 'Reddit',
        status: 'unavailable',
        hits: 0,
        note:
          `Reddit blocked our anonymous request (HTTP ${res.status}) — this is standard for cloud hosts. ` +
          'Create a free Reddit "script" app at https://www.reddit.com/prefs/apps and set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET in your Vercel env to enable Reddit corroboration.',
        evidence: [],
      };
    }
    if (!res.ok) {
      return err('reddit', 'Reddit', `Reddit returned HTTP ${res.status}.`);
    }
    const body = (await res.json().catch(() => null)) as RedditSearchResponse | null;
    const children = body?.data?.children ?? [];
    const evidence: EvidenceItem[] = [];
    const seen = new Set<string>();
    for (const c of children) {
      const d = c.data;
      if (!d?.permalink) continue;
      const postUrl = `https://www.reddit.com${d.permalink}`;
      if (seen.has(postUrl)) continue;
      seen.add(postUrl);
      evidence.push({
        source_id: 'reddit',
        url: postUrl,
        domain: 'reddit.com',
        title: (d.title ?? '').slice(0, 200) || null,
        published_at: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
        is_credible: false,
        excerpt: d.subreddit ? `r/${d.subreddit} · ${d.score ?? 0} upvotes` : null,
      });
      if (evidence.length >= 6) break;
    }
    return {
      id: 'reddit',
      name: 'Reddit',
      status: evidence.length > 0 ? 'hit' : 'miss',
      hits: evidence.length,
      note:
        evidence.length === 0
          ? 'No matching Reddit discussion found in the last 30 days.'
          : `${evidence.length} related Reddit posts in the last 30 days.`,
      evidence,
    };
  } catch {
    return err('reddit', 'Reddit', 'Reddit query failed.');
  }
};

export const searchBluesky: SourceSearcher = async (q) => {
  const query = pickQuery(q);
  if (!query) {
    return { id: 'bluesky', name: 'Bluesky', status: 'skipped', hits: 0, note: 'No query text.', evidence: [] };
  }
  try {
    // Bluesky's public AppView started 401/403-ing anonymous searchPosts
    // calls in 2026. We optionally authenticate via a Bluesky app password
    // when env vars are set. Diagnose each failure mode honestly so the
    // user can actually fix configuration issues from the UI.
    const credsConfigured = Boolean(
      process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD,
    );
    let authToken: string | null = null;
    let authError: string | null = null;
    if (credsConfigured) {
      const authResult = await getBlueskyAccessJwt().catch((e) => ({ token: null, error: String(e?.message ?? e) }));
      authToken = authResult.token;
      authError = authResult.error ?? null;
      if (!authToken) {
        // Env vars are set but createSession failed. Surface this instead of
        // silently falling through to anonymous (which would 403 and report
        // "not configured" — confusing, because the user *has* configured it).
        return {
          id: 'bluesky',
          name: 'Bluesky',
          status: 'unavailable',
          hits: 0,
          note:
            `Bluesky rejected our credentials${authError ? ` (${authError})` : ''}. ` +
            'Double-check BLUESKY_IDENTIFIER (e.g. you.bsky.social) and that BLUESKY_APP_PASSWORD is a fresh app password, not your main login.',
          evidence: [],
        };
      }
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts');
    url.searchParams.set('q', query.slice(0, 200));
    url.searchParams.set('limit', '10');
    url.searchParams.set('sort', 'top');

    const headers: Record<string, string> = {
      'user-agent': UA,
      accept: 'application/json',
    };
    if (authToken) headers.authorization = `Bearer ${authToken}`;

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (!res) {
      return err('bluesky', 'Bluesky', 'Bluesky request failed (timeout or network).');
    }
    // Auth required by Bluesky for search in many regions. Distinguish
    // "env vars missing" from "auth succeeded but search still refused"
    // (e.g. account suspended / rate-limited) so the user can actually fix it.
    if (res.status === 401 || res.status === 403) {
      return {
        id: 'bluesky',
        name: 'Bluesky',
        status: 'unavailable',
        hits: 0,
        note: credsConfigured
          ? `Bluesky accepted our login but refused the search (HTTP ${res.status}). Account may be rate-limited or flagged — try a different Bluesky account.`
          : 'Bluesky search requires auth. Set BLUESKY_IDENTIFIER (e.g. you.bsky.social) and BLUESKY_APP_PASSWORD (app password from bsky.app/settings/app-passwords) in your env.',
        evidence: [],
      };
    }
    if (!res.ok) {
      return err('bluesky', 'Bluesky', `Bluesky returned HTTP ${res.status}.`);
    }
    const body = (await res.json().catch(() => null)) as BlueskySearchResponse | null;
    const posts = body?.posts ?? [];
    const evidence: EvidenceItem[] = [];
    const seen = new Set<string>();
    for (const p of posts) {
      const postUrl = buildBlueskyUrl(p.uri, p.author?.handle);
      if (!postUrl || seen.has(postUrl)) continue;
      seen.add(postUrl);
      const text = typeof p.record?.text === 'string' ? p.record.text : '';
      evidence.push({
        source_id: 'bluesky',
        url: postUrl,
        domain: extractDomain(postUrl) || 'bsky.app',
        title: text.slice(0, 160) || null,
        published_at: p.indexedAt ?? null,
        is_credible: false,
        excerpt: p.author?.handle
          ? `@${p.author.handle} · ${p.likeCount ?? 0} likes · ${p.repostCount ?? 0} reposts`
          : null,
      });
      if (evidence.length >= 6) break;
    }
    return {
      id: 'bluesky',
      name: 'Bluesky',
      status: evidence.length > 0 ? 'hit' : 'miss',
      hits: evidence.length,
      note:
        evidence.length === 0
          ? 'No matching Bluesky posts.'
          : `${evidence.length} related Bluesky posts.`,
      evidence,
    };
  } catch {
    return err('bluesky', 'Bluesky', 'Bluesky query failed.');
  }
};

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Reddit OAuth via the client-credentials flow. Requires a "script" app
 * (free, no user login) at https://www.reddit.com/prefs/apps — Reddit gives
 * you a client_id + client_secret pair. Tokens are valid for ~1 hour; we
 * cache and refresh with a small margin.
 */
let cachedRedditToken: { token: string; expiresAt: number } | null = null;

async function getRedditAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (cachedRedditToken && cachedRedditToken.expiresAt > now) {
    return cachedRedditToken.token;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3_000);
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'user-agent': UA,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: ctrl.signal,
  }).catch(() => null);
  clearTimeout(timer);
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number }
    | null;
  if (!body?.access_token) return null;
  const ttlMs = Math.max(60_000, ((body.expires_in ?? 3600) - 60) * 1000);
  cachedRedditToken = { token: body.access_token, expiresAt: now + ttlMs };
  return body.access_token;
}

/**
 * Create a Bluesky session via the com.atproto.server.createSession XRPC
 * call and return the access JWT. We cache the token in-process for a few
 * minutes so we don't re-auth on every verify call. Returns null when
 * credentials are not configured, which is the happy signal to skip auth.
 */
let cachedBlueskyJwt: { token: string; expiresAt: number } | null = null;
const BSKY_JWT_TTL_MS = 5 * 60 * 1000; // re-auth every 5 minutes — cheap.

interface BlueskyAuthResult {
  token: string | null;
  error?: string;
}

async function getBlueskyAccessJwt(): Promise<BlueskyAuthResult> {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return { token: null, error: 'missing env vars' };

  const now = Date.now();
  if (cachedBlueskyJwt && cachedBlueskyJwt.expiresAt > now) {
    return { token: cachedBlueskyJwt.token };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3_000);
  const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ identifier, password }),
    signal: ctrl.signal,
  }).catch(() => null);
  clearTimeout(timer);
  if (!res) return { token: null, error: 'network timeout' };
  if (!res.ok) {
    const body = (await res.text().catch(() => '')) ?? '';
    // Typical errors: 400 "InvalidIdentifier", 401 "AuthenticationRequired".
    // Surface the upstream error code so configuration mistakes are obvious.
    const match = body.match(/"error"\s*:\s*"([^"]+)"/);
    const upstream = match?.[1] ?? `HTTP ${res.status}`;
    return { token: null, error: upstream };
  }
  const body = (await res.json().catch(() => null)) as { accessJwt?: string } | null;
  if (!body?.accessJwt) return { token: null, error: 'no accessJwt in response' };
  cachedBlueskyJwt = { token: body.accessJwt, expiresAt: now + BSKY_JWT_TTL_MS };
  return { token: body.accessJwt };
}

function pickQuery(q: SourceQuery): string | null {
  const title = (q.title ?? '').trim();
  if (title) return title;
  const text = (q.text ?? '').trim();
  if (text) return text;
  if (q.keywords.length > 0) return q.keywords.slice(0, 6).join(' ');
  return null;
}

function buildBlueskyUrl(uri: string | undefined, handle: string | undefined): string | null {
  if (!uri || !handle) return null;
  // uri format: at://did:plc:xxx/app.bsky.feed.post/<rkey>
  const parts = uri.split('/');
  const rkey = parts[parts.length - 1];
  if (!rkey) return null;
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

function err(
  id: 'reddit' | 'bluesky',
  name: string,
  note: string,
): SourceResult {
  return { id, name, status: 'error', hits: 0, note, evidence: [] };
}

// ─── upstream response shapes ──────────────────────────────────────────────

type RedditSearchResponse = {
  data?: {
    children?: Array<{
      data?: {
        title?: string;
        permalink?: string;
        created_utc?: number;
        subreddit?: string;
        score?: number;
      };
    }>;
  };
};

type BlueskySearchResponse = {
  posts?: Array<{
    uri?: string;
    indexedAt?: string;
    likeCount?: number;
    repostCount?: number;
    author?: { handle?: string };
    record?: { text?: string };
  }>;
};
