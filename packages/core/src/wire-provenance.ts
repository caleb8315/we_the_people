/**
 * Wire provenance detection.
 *
 * Many news outlets republish Reuters/AP/AFP wire copy verbatim or with
 * minimal edits. When 5 outlets all run the same AP story, that's 1
 * independent report, not 5 — but our source_count was treating them
 * as 5 independent corroborators.
 *
 * This module detects wire-sourced content using three heuristics:
 *   1. Byline/attribution markers in the text ("(Reuters)", "AP Photo",
 *      "AFP —", "by Associated Press")
 *   2. Domain-level wire identification (reuters.com, apnews.com, etc.)
 *   3. N-gram overlap: when two evidence excerpts share > 60% of their
 *      4-grams, one is likely derived from the other.
 *
 * The output: each evidence row gets a `wire_source` tag (null if original)
 * and a `is_independent` boolean. The verification/scoring layer then counts
 * distinct independent sources, not just distinct domains.
 */

import type { EvidenceItem } from './types';

// ── Wire service identifiers ────────────────────────────────────────────

const WIRE_DOMAINS = new Set([
  'reuters.com', 'apnews.com', 'afp.com', 'pa.media',
  'upi.com', 'xinhua.net', 'xinhuanet.com', 'tass.com',
  'efe.com', 'ansa.it', 'kyodonews.net',
]);

const WIRE_BYLINE_PATTERNS: Array<{ rx: RegExp; wire: string }> = [
  { rx: /\(Reuters\)/i, wire: 'reuters' },
  { rx: /\breuters\s+(report|file|photo)/i, wire: 'reuters' },
  { rx: /\bby\s+reuters\b/i, wire: 'reuters' },
  { rx: /\(AP\)|\(Associated Press\)/i, wire: 'ap' },
  { rx: /\bAP\s+(Photo|report|file|Exclusive)/i, wire: 'ap' },
  { rx: /\bby\s+Associated Press\b/i, wire: 'ap' },
  { rx: /\bby\s+AP\b/i, wire: 'ap' },
  { rx: /\(AFP\)|\(Agence France[- ]Presse\)/i, wire: 'afp' },
  { rx: /\bAFP\s*[—–-]\s/i, wire: 'afp' },
  { rx: /\bby\s+AFP\b/i, wire: 'afp' },
  { rx: /\bagence france[- ]presse\b/i, wire: 'afp' },
  { rx: /\(UPI\)|\bUnited Press\b/i, wire: 'upi' },
  { rx: /\(Xinhua\)/i, wire: 'xinhua' },
  { rx: /\(TASS\)/i, wire: 'tass' },
  { rx: /\(PA Media\)|\(Press Association\)/i, wire: 'pa' },
];

// ── Public types ────────────────────────────────────────────────────────

export interface WireTag {
  wire_source: string | null;
  is_independent: boolean;
}

export interface TaggedEvidence extends EvidenceItem {
  wire_source: string | null;
  is_independent: boolean;
}

// ── Detection ───────────────────────────────────────────────────────────

/**
 * Detect wire provenance from domain.
 */
function detectWireByDomain(domain: string): string | null {
  const d = (domain ?? '').toLowerCase().replace(/^www\./, '');
  if (d.includes('reuters.com')) return 'reuters';
  if (d.includes('apnews.com') || d.includes('ap.org')) return 'ap';
  if (d.includes('afp.com') || d.includes('france24.com')) return null; // france24 editorial, not just wire
  if (WIRE_DOMAINS.has(d)) return d.split('.')[0] ?? null;
  return null;
}

/**
 * Detect wire provenance from text content (title + excerpt).
 */
function detectWireByByline(text: string): string | null {
  for (const { rx, wire } of WIRE_BYLINE_PATTERNS) {
    if (rx.test(text)) return wire;
  }
  return null;
}

/**
 * Generate character 4-grams from text for overlap detection.
 */
function fourGrams(text: string): Set<string> {
  const clean = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const grams = new Set<string>();
  for (let i = 0; i <= clean.length - 4; i++) {
    grams.add(clean.slice(i, i + 4));
  }
  return grams;
}

/**
 * Containment score: what fraction of A's 4-grams appear in B?
 * Asymmetric — measures how much of A is contained in B.
 */
function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let overlap = 0;
  for (const gram of a) {
    if (b.has(gram)) overlap++;
  }
  return overlap / a.size;
}

const HIGH_CONTAINMENT_THRESHOLD = 0.6;

/**
 * Tag each evidence row with wire provenance information.
 *
 * Strategy:
 *   1. Check domain — is this from a wire service directly?
 *   2. Check byline/attribution markers in title + excerpt.
 *   3. Check n-gram containment against known wire sources.
 *      If a non-wire excerpt overlaps > 60% with a wire excerpt,
 *      mark it as derived (wire_source = the wire, is_independent = false).
 *
 * Evidence rows from wire domains themselves ARE counted as independent
 * (they are the original source), but outlets that republish them are not.
 */
export function tagWireProvenance(evidence: EvidenceItem[]): TaggedEvidence[] {
  // First pass: detect direct wire sources
  const tagged: TaggedEvidence[] = evidence.map(e => {
    const text = `${e.title ?? ''} ${e.excerpt ?? ''}`;
    const domainWire = detectWireByDomain(e.domain);
    const bylineWire = detectWireByByline(text);
    const wire = domainWire ?? bylineWire;

    return {
      ...e,
      wire_source: wire,
      is_independent: wire === null || domainWire !== null,
    };
  });

  // Second pass: n-gram containment against wire sources
  const wireExcerpts: Array<{ wire: string; grams: Set<string> }> = [];
  for (const t of tagged) {
    if (t.wire_source && t.is_independent) {
      const text = `${t.title ?? ''} ${t.excerpt ?? ''}`.trim();
      if (text.length >= 40) {
        wireExcerpts.push({ wire: t.wire_source, grams: fourGrams(text) });
      }
    }
  }

  if (wireExcerpts.length > 0) {
    for (const t of tagged) {
      if (t.is_independent && !t.wire_source) {
        const text = `${t.title ?? ''} ${t.excerpt ?? ''}`.trim();
        if (text.length >= 40) {
          const tGrams = fourGrams(text);
          for (const wex of wireExcerpts) {
            if (containment(tGrams, wex.grams) >= HIGH_CONTAINMENT_THRESHOLD) {
              t.wire_source = wex.wire;
              t.is_independent = false;
              break;
            }
          }
        }
      }
    }
  }

  return tagged;
}

/**
 * Count truly independent sources from tagged evidence.
 * Returns { total, independent, wireGroups }.
 */
export function countIndependentSources(tagged: TaggedEvidence[]): {
  total: number;
  independent: number;
  wire_groups: Record<string, number>;
} {
  const domains = new Set<string>();
  const independentDomains = new Set<string>();
  const wireGroups: Record<string, number> = {};

  for (const t of tagged) {
    if (t.domain) domains.add(t.domain);
    if (t.is_independent && t.domain) {
      independentDomains.add(t.domain);
    }
    if (t.wire_source) {
      wireGroups[t.wire_source] = (wireGroups[t.wire_source] ?? 0) + 1;
    }
  }

  return {
    total: domains.size,
    independent: independentDomains.size,
    wire_groups: wireGroups,
  };
}
