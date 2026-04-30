/**
 * Evidence cards (April 2026 upgrade — fourth ship of the evidence
 * comparison upgrade plan).
 *
 * Each evidence row in the live-corroboration corpus becomes one card
 * with a stable shape:
 *
 *   - source_title  (title or "Reporting from <outlet>")
 *   - publisher     (pretty outlet name from prettyOutletName)
 *   - publish_date  (ISO string, may be null)
 *   - extracted_claim   (the source's first informative sentence)
 *   - stance        (supports | disputes | neutral | context)
 *   - explanation   (one short sentence of why the stance is what it is)
 *
 * Stance is derived deterministically:
 *
 *   - if the evidence row is involved in any contradiction → 'disputes'
 *   - if the role is sensor/official and matches → 'supports'
 *   - if a wide majority of evidence rows agree on the canonical cause
 *     and this row matches → 'supports'
 *   - reference works (Wikipedia etc.) → 'context'
 *   - otherwise neutral (we don't speculate)
 *
 * Pure / deterministic / LLM-free.
 */

import type { EvidenceItem } from './types';
import type { DetectedContradiction } from './contradictions';
import type { RankedSource } from './source-ranking';
import { normalizeCause } from './normalize';

export type EvidenceStance = 'supports' | 'disputes' | 'neutral' | 'context';

export interface EvidenceCard {
  /** Stable id derived from the URL — the UI can use it as a list key. */
  id: string;
  url: string;
  /** Pretty publisher name (e.g. "Reuters", "BBC"). Always non-empty. */
  publisher: string;
  domain: string;
  /** Title of the article / page. */
  source_title: string;
  /** ISO 8601 publish date when known, else null. */
  publish_date: string | null;
  /** One-sentence claim extracted from the source — never invented. */
  extracted_claim: string;
  stance: EvidenceStance;
  /** Plain-English explanation of why this stance was assigned. */
  explanation: string;
  /** Optional rank from source-ranking — lower is "better". */
  rank: number | null;
  /** Subscores (credibility / directness / recency / independence). */
  components: RankedSource['components'] | null;
  /** Role label from source-ranking. */
  role: RankedSource['role'] | null;
  is_credible: boolean;
  /** When true the row was flagged by source-ranking as syndicated/owned. */
  is_syndicated: boolean;
}

export interface BuildEvidenceCardsInput {
  evidence: EvidenceItem[];
  ranked: RankedSource[];
  contradictions: DetectedContradiction[];
}

const REFERENCE_DOMAINS = ['wikipedia.org', 'britannica.com'];

function normalize(domain: string): string {
  return (domain ?? '').toLowerCase().replace(/^www\./, '');
}

function endsWithAny(d: string, suffixes: string[]): boolean {
  return suffixes.some((s) => d === s || d.endsWith('.' + s));
}

function urlId(url: string, fallback: number): string {
  if (!url) return `card_${fallback}`;
  let h = 5381;
  for (let i = 0; i < url.length; i += 1) h = ((h << 5) + h + url.charCodeAt(i)) | 0;
  return `card_${(h >>> 0).toString(36)}`;
}

function prettyOutlet(domain: string): string {
  const d = normalize(domain);
  if (!d) return 'Unknown source';
  // Hand-curated names live in the web layer; here we degrade gracefully.
  const stripped = d.replace(/^(m|mobile|www|edition|media|news|amp|cdn)\./, '');
  const parts = stripped.split('.');
  if (parts.length >= 2) {
    const base = parts[parts.length - 2]!;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return stripped;
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const m = trimmed.match(/^(.{20,260}?[.!?])\s/);
  if (m && m[1]) return m[1].trim();
  if (trimmed.length <= 240) return trimmed;
  return trimmed.slice(0, 220).trim() + '…';
}

function buildExtractedClaim(e: EvidenceItem): string {
  const fromExcerpt = e.excerpt ? firstSentence(e.excerpt) : '';
  if (fromExcerpt) return fromExcerpt;
  if (e.title) return firstSentence(e.title);
  return 'No excerpt available — open the source to read it directly.';
}

function evidenceUrlsFromContradiction(c: DetectedContradiction): Set<string> {
  const urls = new Set<string>();
  const m = c.metadata as Record<string, unknown>;
  for (const key of ['a', 'b', 'assertion', 'observation']) {
    const entry = m?.[key];
    if (entry && typeof entry === 'object') {
      const url = (entry as Record<string, unknown>).url;
      if (typeof url === 'string') urls.add(url);
    }
  }
  return urls;
}

/**
 * Decide the stance for an evidence row. Stance reflects how the row
 * relates to the *aggregate* of other rows — never an absolute truth
 * judgement.
 */
function deriveStance(
  e: EvidenceItem,
  ranked: RankedSource | undefined,
  contradictionUrls: Set<string>,
  dominantCause: string | null,
): { stance: EvidenceStance; explanation: string } {
  if (contradictionUrls.has(e.url)) {
    return {
      stance: 'disputes',
      explanation: 'Involved in at least one detected source disagreement (see conflicts section).',
    };
  }
  if (ranked?.role === 'primary') {
    return {
      stance: 'supports',
      explanation: 'Primary observation from a sensor / first-party source — directly supports the claim shape.',
    };
  }
  if (ranked?.role === 'official') {
    return {
      stance: 'supports',
      explanation: 'Official bulletin from a government / scientific body confirming the underlying event.',
    };
  }
  if (ranked?.role === 'reference' || endsWithAny(normalize(e.domain), REFERENCE_DOMAINS)) {
    return {
      stance: 'context',
      explanation: 'Reference / encyclopedia entry — provides background, not direct corroboration.',
    };
  }
  if (dominantCause && dominantCause !== 'unknown') {
    const cause = normalizeCause(`${e.title ?? ''} ${e.excerpt ?? ''}`);
    if (cause === dominantCause) {
      return {
        stance: 'supports',
        explanation: 'Describes the same canonical cause as the majority of other reporting in this set.',
      };
    }
    if (cause !== 'unknown') {
      return {
        stance: 'disputes',
        explanation: 'Describes a different canonical cause than the majority of other reporting.',
      };
    }
  }
  if (ranked?.role === 'social') {
    return {
      stance: 'neutral',
      explanation: 'Public social post — shows awareness, not independent verification.',
    };
  }
  if (ranked?.role === 'aggregator') {
    return {
      stance: 'context',
      explanation: 'Aggregator surface — usually republishes existing reporting rather than verifying it.',
    };
  }
  return {
    stance: 'neutral',
    explanation: 'Reports the event but the comparison engine could not classify its stance one way or the other.',
  };
}

function dominantCauseOf(evidence: EvidenceItem[]): string | null {
  const buckets = new Map<string, number>();
  for (const e of evidence) {
    const c = normalizeCause(`${e.title ?? ''} ${e.excerpt ?? ''}`);
    if (c === 'unknown') continue;
    buckets.set(c, (buckets.get(c) ?? 0) + 1);
  }
  if (buckets.size === 0) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, v] of buckets) {
    if (v > bestCount) {
      best = k;
      bestCount = v;
    }
  }
  // Require at least 2 sources to call something a "dominant" cause.
  if (bestCount < 2) return null;
  return best;
}

/**
 * Build evidence cards from the full corroboration corpus.
 *
 * Returns one card per *unique URL* — the caller is expected to have
 * already deduped, but we guard against duplicates anyway.
 */
export function buildEvidenceCards(input: BuildEvidenceCardsInput): EvidenceCard[] {
  const { evidence, ranked, contradictions } = input;
  if (evidence.length === 0) return [];

  const rankedMap = new Map<string, RankedSource>();
  for (const r of ranked) rankedMap.set(r.url.toLowerCase(), r);

  const conflictedUrls = new Set<string>();
  for (const c of contradictions) {
    for (const u of evidenceUrlsFromContradiction(c)) {
      conflictedUrls.add(u);
    }
  }

  const dominantCause = dominantCauseOf(evidence);

  const seen = new Set<string>();
  const cards: EvidenceCard[] = [];
  evidence.forEach((e, idx) => {
    const key = (e.url ?? '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    const r = rankedMap.get(key);
    const { stance, explanation } = deriveStance(e, r, conflictedUrls, dominantCause);
    cards.push({
      id: urlId(e.url, idx),
      url: e.url,
      publisher: prettyOutlet(e.domain),
      domain: normalize(e.domain),
      source_title: e.title ?? `Reporting from ${prettyOutlet(e.domain)}`,
      publish_date: e.published_at ?? null,
      extracted_claim: buildExtractedClaim(e),
      stance,
      explanation,
      rank: r?.rank ?? null,
      components: r?.components ?? null,
      role: r?.role ?? null,
      is_credible: r?.is_credible ?? Boolean(e.is_credible),
      is_syndicated: r?.is_syndicated ?? false,
    });
  });

  cards.sort((a, b) => {
    const ra = a.rank ?? 999;
    const rb = b.rank ?? 999;
    if (ra !== rb) return ra - rb;
    if (a.stance !== b.stance) return stanceWeight(a.stance) - stanceWeight(b.stance);
    return 0;
  });

  return cards;
}

function stanceWeight(s: EvidenceStance): number {
  switch (s) {
    case 'supports':
      return 1;
    case 'disputes':
      return 2;
    case 'context':
      return 3;
    case 'neutral':
      return 4;
  }
}

/** Aggregate stance counts. Used in the result-explanation section. */
export interface EvidenceCardSummary {
  total: number;
  supports: number;
  disputes: number;
  context: number;
  neutral: number;
}

export function summarizeEvidenceCards(cards: EvidenceCard[]): EvidenceCardSummary {
  const sum: EvidenceCardSummary = {
    total: cards.length,
    supports: 0,
    disputes: 0,
    context: 0,
    neutral: 0,
  };
  for (const c of cards) sum[c.stance] += 1;
  return sum;
}

/** Friendly display label for stance chips. */
export function stanceLabel(s: EvidenceStance): string {
  switch (s) {
    case 'supports':
      return 'Supports';
    case 'disputes':
      return 'Disputes';
    case 'context':
      return 'Context';
    case 'neutral':
      return 'Neutral';
  }
}
