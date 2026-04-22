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

const GENERIC_UA = 'Crosscheck-Verify/1.0 (+https://crosscheck.app)';
const TIMEOUT_MS = 4_500;

function redditUA(): string {
  const appId = process.env.REDDIT_CLIENT_ID ?? 'crosscheck';
  return `web:${appId}:v1.0 (by Crosscheck)`;
}

export const searchReddit: SourceSearcher = async (q) => {
  const query = pickQuery(q);
  if (!query) {
    return { id: 'reddit', name: 'Reddit', status: 'skipped', hits: 0, note: 'No query text.', evidence: [] };
  }
  try {
    const oauthToken = await getRedditAccessToken().catch(() => null);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    // With OAuth we MUST use oauth.reddit.com; without it, try the public
    // endpoint (will 403 from Vercel but we handle that gracefully).
    const url = new URL(
      oauthToken
        ? 'https://oauth.reddit.com/search'
        : 'https://www.reddit.com/search.json',
    );
    url.searchParams.set('q', query.slice(0, 200));
    url.searchParams.set('limit', '10');
    url.searchParams.set('sort', 'relevance');
    url.searchParams.set('t', 'month');
    url.searchParams.set('raw_json', '1');

    const ua = oauthToken ? redditUA() : GENERIC_UA;
    const headers: Record<string, string> = { 'user-agent': ua, accept: 'application/json' };
    if (oauthToken) headers.authorization = `Bearer ${oauthToken}`;

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (!res) {
      return unavailable('reddit', 'Reddit', 'Reddit request timed out.');
    }
    // Both anonymous and authenticated 403s from Reddit are "unavailable"
    // from the user's perspective. Provide different actionable copy for each
    // so the user knows what to do next.
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      if (!oauthToken) {
        return unavailable(
          'reddit',
          'Reddit',
          `Reddit blocked anonymous search (HTTP ${res.status}). ` +
          'Create a free Reddit app at https://www.reddit.com/prefs/apps (type: "web app") and set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET in Vercel env.',
        );
      }
      return unavailable(
        'reddit',
        'Reddit',
        `Reddit returned HTTP ${res.status} on the authenticated endpoint. This usually means the app type is wrong — go to https://www.reddit.com/prefs/apps, delete the existing app, and create a new one with type "web app" (not "script"). Then update REDDIT_CLIENT_ID/SECRET in Vercel env.`,
      );
    }
    if (!res.ok) {
      return unavailable('reddit', 'Reddit', `Reddit returned HTTP ${res.status}.`);
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

    // When authenticated, route through bsky.social (the PDS) which
    // proxies the search to the AppView. The public.api.bsky.app host
    // rejects authenticated requests with 403 from many cloud hosts.
    // Without auth, try the public AppView — it'll 403 too from Vercel
    // but we handle that gracefully below.
    const searchHost = authToken
      ? 'https://bsky.social/xrpc/app.bsky.feed.searchPosts'
      : 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts';

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const url = new URL(searchHost);
    url.searchParams.set('q', query.slice(0, 200));
    url.searchParams.set('limit', '10');
    url.searchParams.set('sort', 'top');

    const headers: Record<string, string> = {
      'user-agent': GENERIC_UA,
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
      return unavailable('bluesky', 'Bluesky', 'Bluesky request timed out.');
    }
    if (res.status === 401 || res.status === 403) {
      if (!credsConfigured) {
        return unavailable(
          'bluesky',
          'Bluesky',
          'Bluesky search requires auth. Set BLUESKY_IDENTIFIER (e.g. you.bsky.social) and BLUESKY_APP_PASSWORD (app password from bsky.app/settings/app-passwords) in your env.',
        );
      }
      // Auth was configured and login succeeded, but search still 403'd.
      // This can happen if: the account is new / suspended / rate-limited,
      // or the PDS endpoint is also blocking. Surface actionable next steps.
      return unavailable(
        'bluesky',
        'Bluesky',
        `Bluesky search returned HTTP ${res.status} even with valid credentials. ` +
        'This can happen with new or inactive accounts. Try posting something on Bluesky first (activates search permissions), or generate a fresh app password. If it persists, try a different Bluesky account.',
      );
    }
    if (!res.ok) {
      return unavailable('bluesky', 'Bluesky', `Bluesky returned HTTP ${res.status}.`);
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
 * Reddit app-only OAuth. Supports two app types:
 *
 *   • "web app" (confidential client) → `client_credentials` grant.
 *   • "installed app" (public client, no secret) → `installed_client` grant
 *     with a device_id (we use a fixed string — Reddit only uses it for
 *     anonymous rate limiting, not user tracking).
 *
 * "script" type apps need a Reddit username + password which we don't want
 * to ask for. If the user creates a "web app", both ID and secret are set.
 * If they create an "installed app", only the ID is set and the secret is
 * empty/missing. We handle both.
 *
 * Tokens are valid for ~1 hour; we cache with a margin.
 */
let cachedRedditToken: { token: string; expiresAt: number } | null = null;

async function getRedditAccessToken(): Promise<string | null> {
  const clientId = (process.env.REDDIT_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.REDDIT_CLIENT_SECRET ?? '').trim();
  if (!clientId) return null;

  const now = Date.now();
  if (cachedRedditToken && cachedRedditToken.expiresAt > now) {
    return cachedRedditToken.token;
  }

  const ua = redditUA();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4_000);

  let grantBody: string;
  let authHeader: string;
  if (clientSecret) {
    // Confidential client ("web app") — use Basic auth with id:secret.
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    authHeader = `Basic ${basic}`;
    grantBody = 'grant_type=client_credentials';
  } else {
    // Public client ("installed app") — no secret, send id in Basic with
    // empty password and use the installed_client grant with a device_id.
    const basic = Buffer.from(`${clientId}:`).toString('base64');
    authHeader = `Basic ${basic}`;
    grantBody = 'grant_type=https%3A%2F%2Foauth.reddit.com%2Fgrants%2Finstalled_client&device_id=DO_NOT_TRACK_THIS_DEVICE';
  }

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: authHeader,
      'user-agent': ua,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: grantBody,
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
  const identifier = (process.env.BLUESKY_IDENTIFIER ?? '').trim();
  const password = (process.env.BLUESKY_APP_PASSWORD ?? '').trim();
  if (!identifier || !password) return { token: null, error: 'missing env vars' };

  // Catch the two most common Vercel misconfigs before we waste a round-trip
  // to Bluesky (whose error codes are unhelpful). These messages surface in
  // the coverage-strip diagnostic so the user knows what to fix.
  if (identifier.includes('@') && identifier.includes('.')) {
    // Could be an email OR a handle that happens to contain @ — Bluesky
    // handles do NOT contain @. If it looks like an email, reject early.
    const looksLikeEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier);
    if (looksLikeEmail) {
      return {
        token: null,
        error:
          'BLUESKY_IDENTIFIER looks like an email. Use your full Bluesky handle instead (e.g. "you.bsky.social"), NOT your signup email.',
      };
    }
  }
  if (identifier.startsWith('@')) {
    return {
      token: null,
      error:
        'BLUESKY_IDENTIFIER should not start with "@" — just use the bare handle, e.g. "you.bsky.social".',
    };
  }
  // App passwords have a distinctive xxxx-xxxx-xxxx-xxxx format. If the
  // configured password doesn't contain a hyphen, it's almost certainly the
  // main account password, which Bluesky will reject.
  if (!password.includes('-')) {
    return {
      token: null,
      error:
        'BLUESKY_APP_PASSWORD does not look like an app password (expected "xxxx-xxxx-xxxx-xxxx"). Generate one at https://bsky.app/settings/app-passwords — do NOT use your main password.',
    };
  }

  const now = Date.now();
  if (cachedBlueskyJwt && cachedBlueskyJwt.expiresAt > now) {
    return { token: cachedBlueskyJwt.token };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3_000);
  const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': GENERIC_UA },
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

function unavailable(
  id: 'reddit' | 'bluesky',
  name: string,
  note: string,
): SourceResult {
  return { id, name, status: 'unavailable', hits: 0, note, evidence: [] };
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
