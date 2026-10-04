import type { SourceLedger } from './ledger';
import type { CitationStance, VerifiedCitation } from './schema';

export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032`´]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033«»„]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^\p{L}\p{M}\p{N}'"%$€£¥.,:;!?()\- ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalizeForMatch(s)
    .replace(/[.,:;!?()"']/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/**
 * Does `quote` appear in `haystack`? Exact match after normalisation, or a
 * near-verbatim window (≥ 90% of the quote's tokens, in a span of the same
 * length) to tolerate whitespace/punctuation/encoding differences.
 * Ellipses split the quote into fragments that must each match.
 */
export function quoteAppearsIn(quote: string, haystack: string): boolean {
  const fragments = quote
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/)
    .map((f) => f.trim())
    .filter((f) => tokens(f).length >= 2 || f.length >= 6);
  if (fragments.length === 0) return false;
  const normHay = normalizeForMatch(haystack);
  const hayTokens = tokens(haystack);
  return fragments.every((frag) => {
    if (normHay.includes(normalizeForMatch(frag))) return true;
    const q = tokens(frag);
    if (q.length < 4) return false;
    const need = Math.ceil(q.length * 0.9);
    const qCounts = new Map<string, number>();
    for (const t of q) qCounts.set(t, (qCounts.get(t) ?? 0) + 1);
    const window = q.length + 2;
    for (let i = 0; i + q.length <= hayTokens.length; i += 1) {
      if (!qCounts.has(hayTokens[i]!)) continue;
      const counts = new Map(qCounts);
      let hit = 0;
      for (let j = i; j < Math.min(hayTokens.length, i + window); j += 1) {
        const c = counts.get(hayTokens[j]!);
        if (c) {
          counts.set(hayTokens[j]!, c - 1);
          hit += 1;
          if (hit >= need) return true;
        }
      }
    }
    return false;
  });
}

export interface CitationCheck {
  kept: VerifiedCitation[];
  removed: Array<{ source_id: string; quote: string; reason: 'unknown_source' | 'quote_not_found' }>;
}

export function verifyCitations(
  citations: Array<{ source_id: string; quote: string; stance: CitationStance }>,
  ledger: SourceLedger,
): CitationCheck {
  const kept: VerifiedCitation[] = [];
  const removed: CitationCheck['removed'] = [];
  const seen = new Set<string>();
  for (const c of citations) {
    const id = c.source_id.trim().replace(/^\[|\]$/g, '').toUpperCase();
    const entry = ledger.get(id);
    if (!entry) {
      removed.push({ source_id: c.source_id, quote: c.quote, reason: 'unknown_source' });
      continue;
    }
    const haystack = [entry.title, entry.snippet, entry.text].filter(Boolean).join('\n');
    if (!quoteAppearsIn(c.quote, haystack)) {
      removed.push({ source_id: id, quote: c.quote, reason: 'quote_not_found' });
      continue;
    }
    const key = `${id}|${normalizeForMatch(c.quote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ source_id: id, quote: c.quote.trim(), stance: c.stance });
  }
  return { kept, removed };
}

/** Remove [S#] markers that point at sources not in the ledger. */
export function scrubMarkers(text: string, ledger: SourceLedger): string {
  return text.replace(/\[(S\d+)(?:\s*,\s*S\d+)*\]/g, (match) => {
    const ids = match.slice(1, -1).split(/\s*,\s*/).filter((id) => ledger.get(id));
    return ids.length ? `[${ids.join(', ')}]` : '';
  });
}
