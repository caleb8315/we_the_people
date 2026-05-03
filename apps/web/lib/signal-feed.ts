import type { SignalRowRaw } from './signals';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'were',
  'with',
]);

interface GroupedSignalResult<T extends SignalRowRaw> {
  primary: T;
  groupedCount: number;
  groupedSignalIds: string[];
}

/**
 * Groups near-duplicate signals so feed cards stay high-signal and compact.
 * Signals are considered related when topic/country are aligned and the
 * normalized title token overlap clears a high threshold.
 */
export function groupSignalsForFeed<T extends SignalRowRaw>(rows: T[]): GroupedSignalResult<T>[] {
  if (!rows.length) return [];

  const sorted = [...rows].sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return recencyScore(b) - recencyScore(a);
  });

  const consumed = new Set<string>();
  const out: GroupedSignalResult<T>[] = [];

  for (const candidate of sorted) {
    if (consumed.has(candidate.id)) continue;
    consumed.add(candidate.id);

    const cluster = [candidate];
    const baseTokens = normalizedTokens(candidate.title);

    for (const probe of sorted) {
      if (probe.id === candidate.id || consumed.has(probe.id)) continue;
      if (!isComparable(candidate, probe)) continue;
      const overlap = tokenSimilarity(baseTokens, normalizedTokens(probe.title));
      if (overlap < 0.58) continue;
      consumed.add(probe.id);
      cluster.push(probe);
    }

    out.push({
      primary: pickPrimary(cluster),
      groupedCount: cluster.length,
      groupedSignalIds: cluster.map((s) => s.id),
    });
  }

  return out.sort((a, b) => {
    const sev = b.primary.severity - a.primary.severity;
    if (sev !== 0) return sev;
    return recencyScore(b.primary) - recencyScore(a.primary);
  });
}

export function recencyScore(row: Pick<SignalRowRaw, 'occurred_at' | 'first_seen_at'>): number {
  const ts = Date.parse(row.occurred_at ?? row.first_seen_at);
  if (!Number.isFinite(ts)) return 0;
  return ts;
}

function pickPrimary<T extends SignalRowRaw>(cluster: T[]): T {
  return [...cluster].sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    const aCred = safeNum(a.credible_source_count);
    const bCred = safeNum(b.credible_source_count);
    if (bCred !== aCred) return bCred - aCred;
    const aSources = safeNum(a.source_count);
    const bSources = safeNum(b.source_count);
    if (bSources !== aSources) return bSources - aSources;
    return recencyScore(b) - recencyScore(a);
  })[0]!;
}

function isComparable(a: SignalRowRaw, b: SignalRowRaw): boolean {
  if ((a.topic ?? 'other') !== (b.topic ?? 'other')) return false;
  const aCountry = (a.country_code ?? '').toUpperCase();
  const bCountry = (b.country_code ?? '').toUpperCase();
  if (aCountry && bCountry && aCountry !== bCountry) return false;
  return true;
}

function normalizedTokens(input: string): Set<string> {
  const tokens = String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(tokens);
}

function tokenSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

function safeNum(v: unknown): number {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}
