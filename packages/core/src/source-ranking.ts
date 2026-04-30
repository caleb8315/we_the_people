/**
 * Source ranking (April 2026 upgrade — first ship of the evidence
 * comparison upgrade plan).
 *
 * Goal: take the heterogeneous bag of evidence the live-corroboration
 * fan-out produces (rated outlets, regional outlets, sensor networks,
 * Wikipedia, social posts, GDELT mentions) and turn it into a ranked
 * list where the order itself is *defensible*. Every row carries:
 *
 *   - a numeric `score` (0–100) used for the ranking,
 *   - the four sub-scores that drove the score, and
 *   - a short list of plain-language `reasons` so the UI can answer
 *     "why is this source ranked above that one?" without hand-waving.
 *
 * Four dimensions, deliberately weighted:
 *
 *   credibility    — 35%   is this source on our rated-outlet list, a
 *                          government / scientific bulletin, or an
 *                          unfamiliar domain?
 *   directness     — 25%   does this look like a primary source (sensor
 *                          reading, official bulletin, original report)
 *                          or a syndication / aggregator / commentary?
 *   recency        — 20%   how recent is the published_at (when known)?
 *                          We prefer fresh observations for breaking
 *                          stories but never *penalize* a still-relevant
 *                          background source by much.
 *   independence   — 20%   does this source share a parent-domain or
 *                          obvious wire-syndication pattern with another
 *                          higher-ranked source already in the list?
 *
 * Non-negotiable rules (mirror the existing trust-explainer contract):
 *   - Deterministic. Pure function. No LLM, no network.
 *   - We never claim a source is "wrong" — only how directly / recently /
 *     independently it speaks to the claim being verified.
 *   - Sensor / official bulletin sources always get the `primary` role
 *     when they match — physical measurements outrank narrative reporting.
 */

import type { EvidenceItem } from './types';
import { isCredibleDomain } from './domains';

/** Coarse role label used in the UI and reasons list. */
export type SourceRole =
  | 'primary'
  | 'official'
  | 'reporting'
  | 'reference'
  | 'social'
  | 'aggregator'
  | 'unknown';

export interface RankedSourceReason {
  /** Stable machine tag — the UI can choose its own copy. */
  tag:
    | 'rated_outlet'
    | 'unrated_outlet'
    | 'sensor_network'
    | 'official_bulletin'
    | 'reference_work'
    | 'social_post'
    | 'aggregator'
    | 'first_party'
    | 'recent'
    | 'older'
    | 'undated'
    | 'shares_owner'
    | 'wire_syndication'
    | 'independent_domain'
    | 'matches_submission';
  /** Plain English line. Always safe to render. */
  text: string;
  /** Whether this reason raised or lowered the source's score. */
  effect: 'positive' | 'negative' | 'neutral';
}

export interface RankedSource {
  url: string;
  domain: string;
  title: string | null;
  published_at: string | null;
  is_credible: boolean;
  /** Coarse role for grouping. */
  role: SourceRole;
  /** Stable rank within the result list, lowest = best. */
  rank: number;
  /** Composite score, 0–100. */
  score: number;
  /** Sub-scores broken down for transparency. */
  components: {
    credibility: number;
    directness: number;
    recency: number;
    independence: number;
  };
  /** 1–4 short, ordered reasons. The UI shows the top 2 by default. */
  reasons: RankedSourceReason[];
  /** When true the row is a sensor / official primary observation. */
  is_primary: boolean;
  /** Source treated as a likely wire / aggregator restatement of another. */
  is_syndicated: boolean;
}

export interface RankSourcesInput {
  /** All evidence collected for the signal / verification. */
  evidence: EvidenceItem[];
  /**
   * Anchor URL the user submitted (when verifying a specific link).
   * The matching evidence row gets a small "matches submission" boost so
   * the user's own submission stays in primary slot.
   */
  anchor_url?: string | null;
  /** "now" reference for recency calc; defaults to Date.now(). */
  now_ms?: number;
}

const SENSOR_DOMAIN_SUFFIXES = [
  'usgs.gov',
  'earthquake.usgs.gov',
  'volcanoes.usgs.gov',
  'eonet.gsfc.nasa.gov',
  'eonet.sci.gsfc.nasa.gov',
  'nasa.gov',
  'noaa.gov',
  'weather.gov',
  'swpc.noaa.gov',
];

const OFFICIAL_DOMAIN_SUFFIXES = [
  'who.int',
  'cdc.gov',
  'reliefweb.int',
  'gdacs.org',
  'sec.gov',
  'bls.gov',
  'federalreserve.gov',
  'ecb.europa.eu',
  'imf.org',
  'worldbank.org',
  'state.gov',
  'defense.gov',
  'cisa.gov',
  'esa.int',
  'nist.gov',
  'un.org',
];

const REFERENCE_DOMAIN_SUFFIXES = ['wikipedia.org', 'britannica.com'];

const SOCIAL_DOMAIN_SUFFIXES = [
  'reddit.com',
  'bsky.app',
  'twitter.com',
  'x.com',
  'mastodon.social',
  'threads.net',
  'tiktok.com',
  'facebook.com',
  'instagram.com',
];

const WIRE_DOMAIN_SUFFIXES = [
  'reuters.com',
  'apnews.com',
  'ap.org',
  'afp.com',
];

const AGGREGATOR_DOMAIN_SUFFIXES = [
  'news.google.com',
  'flipboard.com',
  'msn.com',
  'yahoo.com',
];

/** Brand families share a common owner / editorial stance — drop their
 *  independence weight. The list is intentionally short; we only mark
 *  pairs where it is clearly defensible. */
const BRAND_FAMILIES: Array<readonly string[]> = [
  ['cnn.com', 'media.cnn.com', 'edition.cnn.com'],
  ['nytimes.com', 'nyt.com'],
  ['washingtonpost.com', 'wapo.st'],
  ['bbc.com', 'bbc.co.uk', 'news.bbc.co.uk'],
  ['nbcnews.com', 'today.com', 'cnbc.com'],
  ['foxnews.com', 'foxbusiness.com'],
  ['abcnews.go.com', 'go.com'],
  ['huffpost.com', 'huffingtonpost.com'],
  ['wsj.com', 'marketwatch.com', 'barrons.com'],
  ['ft.com', 'ftadviser.com'],
  ['dailymail.co.uk', 'mailonline.com'],
  ['vox.com', 'theverge.com'],
  ['nytimes.com', 'nyt.com'],
  ['gannett.com', 'usatoday.com'],
];

function normalize(domain: string): string {
  return (domain ?? '').toLowerCase().replace(/^www\./, '');
}

function endsWithAny(d: string, suffixes: string[]): boolean {
  return suffixes.some((s) => d === s || d.endsWith('.' + s));
}

/** Extract the owner family for a domain, if any. */
function brandFamilyOf(domain: string): string | null {
  const d = normalize(domain);
  for (const family of BRAND_FAMILIES) {
    if (family.some((m) => d === m || d.endsWith('.' + m))) {
      return family[0]!;
    }
  }
  return null;
}

function classifyRole(domain: string, sourceId: string | null): SourceRole {
  const d = normalize(domain);
  if (
    endsWithAny(d, SENSOR_DOMAIN_SUFFIXES) ||
    sourceId === 'usgs' ||
    sourceId === 'usgs-quakes' ||
    sourceId === 'nasa-eonet' ||
    sourceId === 'noaa-alerts' ||
    sourceId === 'swpc-alerts'
  ) {
    return 'primary';
  }
  if (endsWithAny(d, OFFICIAL_DOMAIN_SUFFIXES)) return 'official';
  if (endsWithAny(d, REFERENCE_DOMAIN_SUFFIXES)) return 'reference';
  if (endsWithAny(d, SOCIAL_DOMAIN_SUFFIXES)) return 'social';
  if (endsWithAny(d, AGGREGATOR_DOMAIN_SUFFIXES)) return 'aggregator';
  if (!d) return 'unknown';
  return 'reporting';
}

/** Map the source role to a directness baseline (0–100). */
function directnessFromRole(role: SourceRole, isWire: boolean): number {
  switch (role) {
    case 'primary':
      return 95; // sensor / first-party primary observation
    case 'official':
      return 85; // statutory bulletin / first-party institution
    case 'reporting':
      return isWire ? 78 : 65; // wires speak first; outlets carry it
    case 'reference':
      return 45; // reference works are summaries, not primary reports
    case 'social':
      return 35; // useful signal of awareness, weak as evidence
    case 'aggregator':
      return 20; // rarely original reporting
    case 'unknown':
      return 30;
  }
}

/** Recency score (0–100). 100 within the last 24h, 0 once a year stale.
 *  Sources without a published_at get a neutral 50 — we don't want to
 *  punish background reference works (Wikipedia) for being undated. */
function computeRecency(publishedAt: string | null, nowMs: number): number {
  if (!publishedAt) return 50;
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return 50;
  const ageHours = Math.max(0, (nowMs - t) / 36e5);
  if (ageHours <= 6) return 100;
  if (ageHours <= 24) return 92;
  if (ageHours <= 72) return 80;
  if (ageHours <= 24 * 7) return 65;
  if (ageHours <= 24 * 30) return 50;
  if (ageHours <= 24 * 90) return 35;
  if (ageHours <= 24 * 365) return 20;
  return 10;
}

function recencyDescriptor(score: number, publishedAt: string | null): RankedSourceReason {
  if (!publishedAt) {
    return {
      tag: 'undated',
      text: 'No publish date attached — recency could not be checked.',
      effect: 'neutral',
    };
  }
  if (score >= 80) {
    return { tag: 'recent', text: 'Published within the last few days.', effect: 'positive' };
  }
  if (score >= 50) {
    return { tag: 'recent', text: 'Published recently (within the last month).', effect: 'neutral' };
  }
  return {
    tag: 'older',
    text: 'Source is older — useful for context, weaker for breaking developments.',
    effect: 'negative',
  };
}

/**
 * Rank a list of evidence rows.
 *
 * Stable: the input order is used as a tiebreaker so we never reorder
 * equal-scoring rows on subsequent calls. The sensor/official rows are
 * always promoted to the top via their high directness baseline.
 */
export function rankSources(input: RankSourcesInput): RankedSource[] {
  const { evidence } = input;
  const nowMs = input.now_ms ?? Date.now();
  const anchor = input.anchor_url ? input.anchor_url.toLowerCase() : null;

  // First pass — compute baseline metrics independent of position.
  const baseline = evidence.map((e, i) => {
    const domain = normalize(e.domain ?? '');
    const role = classifyRole(domain, e.source_id ?? null);
    const isWire = endsWithAny(domain, WIRE_DOMAIN_SUFFIXES);
    const isCredible =
      Boolean(e.is_credible) ||
      isCredibleDomain(domain) ||
      role === 'primary' ||
      role === 'official';
    const credibility = isCredible ? 90 : domain ? 45 : 30;
    const directness = directnessFromRole(role, isWire);
    const recency = computeRecency(e.published_at ?? null, nowMs);
    const family = brandFamilyOf(domain);
    return {
      e,
      i,
      domain,
      role,
      isWire,
      isCredible,
      credibility,
      directness,
      recency,
      family,
    };
  });

  // Second pass — independence depends on what's already in the list.
  // We greedily walk the list in *baseline* score order and dock items
  // that share a brand family or look like a wire restatement.
  const order = [...baseline].sort((a, b) => {
    const ba = a.credibility * 0.35 + a.directness * 0.35 + a.recency * 0.3;
    const bb = b.credibility * 0.35 + b.directness * 0.35 + b.recency * 0.3;
    if (ba !== bb) return bb - ba;
    return a.i - b.i;
  });

  const seenFamilies = new Set<string>();
  const seenWires = new Set<string>();
  const independenceMap = new Map<number, { score: number; tag: RankedSourceReason['tag'] }>();
  for (const row of order) {
    let score = 100;
    let tag: RankedSourceReason['tag'] = 'independent_domain';
    if (row.family) {
      if (seenFamilies.has(row.family)) {
        score = 30;
        tag = 'shares_owner';
      } else {
        seenFamilies.add(row.family);
      }
    }
    if (row.isWire) {
      if (seenWires.has('wire')) {
        score = Math.min(score, 50);
        if (tag === 'independent_domain') tag = 'wire_syndication';
      } else {
        seenWires.add('wire');
      }
    }
    if (row.role === 'aggregator') {
      score = Math.min(score, 35);
      tag = 'aggregator';
    }
    independenceMap.set(row.i, { score, tag });
  }

  // Third pass — final composite + reasons.
  const ranked = baseline.map((b) => {
    const indep = independenceMap.get(b.i) ?? { score: 70, tag: 'independent_domain' as const };
    const matchesSubmission = anchor && b.e.url && b.e.url.toLowerCase() === anchor;

    // Composite score with a small bump for the anchor.
    let score =
      b.credibility * 0.35 +
      b.directness * 0.25 +
      b.recency * 0.2 +
      indep.score * 0.2;
    if (matchesSubmission) score = Math.min(100, score + 4);
    score = Math.round(Math.max(0, Math.min(100, score)));

    const reasons: RankedSourceReason[] = [];
    if (b.role === 'primary') {
      reasons.push({
        tag: 'sensor_network',
        text: 'Primary observation from a public sensor network.',
        effect: 'positive',
      });
    } else if (b.role === 'official') {
      reasons.push({
        tag: 'official_bulletin',
        text: 'Official bulletin from a government / scientific body.',
        effect: 'positive',
      });
    } else if (b.role === 'reference') {
      reasons.push({
        tag: 'reference_work',
        text: 'Reference / encyclopedia entry — useful for context, not primary reporting.',
        effect: 'neutral',
      });
    } else if (b.role === 'social') {
      reasons.push({
        tag: 'social_post',
        text: 'Public social post — shows awareness, not independent verification.',
        effect: 'neutral',
      });
    } else if (b.role === 'aggregator') {
      reasons.push({
        tag: 'aggregator',
        text: 'Aggregator surface — usually republishes existing reporting.',
        effect: 'negative',
      });
    } else if (b.isCredible) {
      reasons.push({
        tag: 'rated_outlet',
        text: 'Domain is on our rated-outlet list (see /reliability).',
        effect: 'positive',
      });
    } else if (b.domain) {
      reasons.push({
        tag: 'unrated_outlet',
        text: 'Domain is not on our rated-outlet list — judge its track record directly.',
        effect: 'neutral',
      });
    }

    if (matchesSubmission) {
      reasons.unshift({
        tag: 'matches_submission',
        text: 'This is the URL you submitted — kept as the primary anchor of the comparison.',
        effect: 'positive',
      });
    }

    if (indep.tag === 'shares_owner') {
      reasons.push({
        tag: 'shares_owner',
        text: 'Shares an owner / brand family with a higher-ranked source — counted with reduced weight.',
        effect: 'negative',
      });
    } else if (indep.tag === 'wire_syndication') {
      reasons.push({
        tag: 'wire_syndication',
        text: 'Looks like a wire-service restatement of another source already in the list.',
        effect: 'negative',
      });
    }

    reasons.push(recencyDescriptor(b.recency, b.e.published_at ?? null));

    return {
      url: b.e.url,
      domain: b.domain,
      title: b.e.title ?? null,
      published_at: b.e.published_at ?? null,
      is_credible: b.isCredible,
      role: b.role,
      rank: 0,
      score,
      components: {
        credibility: Math.round(b.credibility),
        directness: Math.round(b.directness),
        recency: Math.round(b.recency),
        independence: Math.round(indep.score),
      },
      reasons: reasons.slice(0, 4),
      is_primary: b.role === 'primary' || b.role === 'official',
      is_syndicated: indep.tag === 'wire_syndication' || indep.tag === 'shares_owner',
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable secondary: primary roles first, then credible, then domain.
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    if (a.is_credible !== b.is_credible) return a.is_credible ? -1 : 1;
    return a.domain.localeCompare(b.domain);
  });

  ranked.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  return ranked;
}

/**
 * Aggregate counts that the UI / confidence layer needs from a ranked
 * list, computed in one pass so consumers don't reimplement them.
 */
export interface RankedSourceSummary {
  total: number;
  primaries: number;
  officials: number;
  rated_outlets: number;
  social_posts: number;
  aggregators: number;
  references: number;
  syndicated_or_owned: number;
  median_recency: number;
}

export function summarizeRankedSources(
  ranked: RankedSource[],
): RankedSourceSummary {
  const sum: RankedSourceSummary = {
    total: ranked.length,
    primaries: 0,
    officials: 0,
    rated_outlets: 0,
    social_posts: 0,
    aggregators: 0,
    references: 0,
    syndicated_or_owned: 0,
    median_recency: 0,
  };
  if (ranked.length === 0) return sum;
  const recencyVals: number[] = [];
  for (const r of ranked) {
    recencyVals.push(r.components.recency);
    if (r.role === 'primary') sum.primaries += 1;
    if (r.role === 'official') sum.officials += 1;
    if (r.is_credible && r.role !== 'primary' && r.role !== 'official') {
      sum.rated_outlets += 1;
    }
    if (r.role === 'social') sum.social_posts += 1;
    if (r.role === 'aggregator') sum.aggregators += 1;
    if (r.role === 'reference') sum.references += 1;
    if (r.is_syndicated) sum.syndicated_or_owned += 1;
  }
  recencyVals.sort((a, b) => a - b);
  const mid = Math.floor(recencyVals.length / 2);
  sum.median_recency =
    recencyVals.length % 2 === 0
      ? Math.round((recencyVals[mid - 1]! + recencyVals[mid]!) / 2)
      : recencyVals[mid]!;
  return sum;
}

/** Friendly role label used in the UI when a chip is shown. */
export function roleLabel(role: SourceRole): string {
  switch (role) {
    case 'primary':
      return 'Primary observation';
    case 'official':
      return 'Official bulletin';
    case 'reporting':
      return 'Reporting';
    case 'reference':
      return 'Reference';
    case 'social':
      return 'Social post';
    case 'aggregator':
      return 'Aggregator';
    case 'unknown':
      return 'Unrated';
  }
}
