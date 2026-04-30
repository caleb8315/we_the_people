/**
 * Prediction-market signal source.
 *
 * Polymarket's Gamma API is free and public (no auth required). We use it as
 * a lightweight "market sentiment / attention" signal, not as factual
 * corroboration. Returned rows are explicitly unrated (`is_credible: false`).
 */

import type { EvidenceItem } from '@osint/core';
import type { SourceQuery, SourceResult, SourceSearcher } from './types';

const UA = 'Crosscheck-Verify/1.0 (+https://crosscheck.app)';
const TIMEOUT_MS = 4_500;
const MAX_RESULTS = 4;
const API_BASE = 'https://gamma-api.polymarket.com';

export const searchPolymarket: SourceSearcher = async (q) => {
  const query = pickQuery(q);
  if (!query) {
    return {
      id: 'polymarket',
      name: 'Polymarket',
      status: 'skipped',
      hits: 0,
      note: 'No query text.',
      evidence: [],
    };
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const url = new URL(`${API_BASE}/events`);
    url.searchParams.set('limit', '30');
    url.searchParams.set('active', 'true');
    url.searchParams.set('closed', 'false');
    url.searchParams.set('order', 'volume_24hr');
    url.searchParams.set('ascending', 'false');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(timer);

    if (!res) return unavailable('Polymarket request timed out.');
    if (!res.ok) return unavailable(`Polymarket returned HTTP ${res.status}.`);

    const body = (await res.json().catch(() => null)) as PolymarketEvent[] | null;
    if (!Array.isArray(body)) return unavailable('Polymarket returned an invalid response.');

    const tokens = normalizeQueryTokens(query);
    const evidence: EvidenceItem[] = [];
    for (const event of body) {
      const title = (event.title ?? '').trim();
      if (!title) continue;
      if (!matchesQuery(title, tokens)) continue;
      const eventSlug = (event.slug ?? '').trim();
      const eventUrl = eventSlug
        ? `https://polymarket.com/event/${eventSlug}`
        : event.id != null
          ? `https://polymarket.com/event/${event.id}`
          : null;
      if (!eventUrl) continue;
      const volume = formatVolume(event.volume24hr ?? event.volume ?? null);
      evidence.push({
        source_id: 'polymarket',
        url: eventUrl,
        domain: 'polymarket.com',
        title,
        published_at: coerceIso(event.startDate ?? event.createdAt ?? null),
        is_credible: false,
        excerpt: volume
          ? `Prediction market signal · 24h volume ${volume}`
          : 'Prediction market signal',
      });
      if (evidence.length >= MAX_RESULTS) break;
    }

    return {
      id: 'polymarket',
      name: 'Polymarket',
      status: evidence.length > 0 ? 'hit' : 'miss',
      hits: evidence.length,
      note:
        evidence.length > 0
          ? `${evidence.length} relevant market signal${evidence.length === 1 ? '' : 's'} found.`
          : 'No relevant active markets found.',
      evidence,
    };
  } catch {
    return unavailable('Polymarket query failed.');
  }
};

function unavailable(note: string): SourceResult {
  return {
    id: 'polymarket',
    name: 'Polymarket',
    status: 'unavailable',
    hits: 0,
    note,
    evidence: [],
  };
}

function pickQuery(q: SourceQuery): string | null {
  const title = (q.title ?? '').trim();
  if (title) return title;
  const text = (q.text ?? '').trim();
  if (text) return text;
  const fromKeywords = q.keywords.slice(0, 6).join(' ').trim();
  return fromKeywords || null;
}

function normalizeQueryTokens(query: string): string[] {
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'for', 'with', 'that', 'this', 'from', 'into', 'about',
    'what', 'when', 'where', 'will', 'would', 'could', 'should', 'today', 'latest', 'breaking',
    'news', 'report', 'reports', 'reported',
  ]);
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !stop.has(t));
  return [...new Set(tokens)].slice(0, 6);
}

function matchesQuery(title: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const hay = title.toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    if (hay.includes(token)) hits += 1;
  }
  return hits >= Math.min(2, tokens.length);
}

function coerceIso(input: string | null): string | null {
  if (!input) return null;
  const ms = Date.parse(input);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function formatVolume(raw: number | string | null): string | null {
  const num =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${Math.round(num)}`;
}

type PolymarketEvent = {
  id?: string | number;
  slug?: string;
  title?: string;
  startDate?: string;
  createdAt?: string;
  volume24hr?: number | string;
  volume?: number | string;
};
