/**
 * Event clustering — groups articles about the same real-world event.
 *
 * Multi-layer strategy (no LLM, no external dependencies):
 *
 *   1. Partition by (topic group, day-window) — O(n) pass.
 *      Topic affinity groups allow cross-topic matching (e.g. war↔civil).
 *      Adjacent-day overlap covers timezone-boundary publication.
 *
 *   2. For each headline, build a rich term set:
 *      a. Tokenize, strip stop words
 *      b. Stem via Porter algorithm
 *      c. Expand synonyms to canonical forms
 *      d. Extract named entities (countries, cities, orgs, leaders)
 *      e. Extract bigrams for phrase-level signal
 *
 *   3. Compute weighted Jaccard similarity. Entity tokens carry 2× weight
 *      since shared entities are much stronger event identity signals
 *      than shared common words.
 *
 *   4. Union-find merges pairs above MERGE_THRESHOLD. Transitive closure
 *      ensures A≈B and B≈C → A,B,C all cluster together.
 *
 *   5. Return merged groups keyed by a stable hash of the representative
 *      (first-seen) title.
 */

import { porterStem } from './stemmer';
import { extractEntities, entityTokens } from './entities';
import { canonicalSynonym } from './synonyms';
import { topicGroupsForClustering } from './topic-groups';

// ── Stop words ──────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'not', 'no', 'nor', 'so',
  'yet', 'than', 'that', 'this', 'these', 'those', 'it', 'its', 'he',
  'she', 'they', 'we', 'you', 'i', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'our', 'their', 'who', 'what', 'which', 'when',
  'where', 'how', 'why', 'if', 'then', 'else', 'as', 'about', 'up',
  'out', 'into', 'over', 'after', 'before', 'between', 'under', 'again',
  'just', 'also', 'more', 'most', 'some', 'any', 'each', 'all', 'both',
  'few', 'such', 'very', 'too', 'only', 'own', 'same', 'other',
  'new', 'old', 'says', 'said', 'say', 'report', 'reports', 'reported',
  'according', 'amid', 'during', 'while', 'now', 'per', 'via',
  'latest', 'update', 'news', 'breaking',
]);

const MERGE_THRESHOLD = 0.18;

// ── Public API ──────────────────────────────────────────────────────────

export interface Clusterable {
  title: string;
  topic: string;
  published_day: string; // YYYY-MM-DD or ''
}

/**
 * Expand a single day into overlapping windows so articles published
 * across a day boundary can still merge. Extends to ±1 day pairs.
 */
function dayWindows(day: string): string[] {
  if (!day) return [''];
  try {
    const d = new Date(day + 'T12:00:00Z');
    const prev = new Date(d.getTime() - 86_400_000);
    const next = new Date(d.getTime() + 86_400_000);
    const cur = day;
    const prevStr = prev.toISOString().slice(0, 10);
    const nextStr = next.toISOString().slice(0, 10);
    const pairPrev = prevStr < cur ? `${prevStr}~${cur}` : `${cur}~${prevStr}`;
    const pairNext = cur < nextStr ? `${cur}~${nextStr}` : `${nextStr}~${cur}`;
    return [cur, pairPrev, pairNext];
  } catch {
    return [day];
  }
}

/**
 * Given an array of items, return a cluster-id for each item (same index).
 * Items that belong to the same event get the same cluster id.
 */
export function clusterItems<T extends Clusterable>(items: T[]): number[] {
  if (items.length === 0) return [];

  // 1. Partition by (topic-group, day-window).
  // 'other' articles go into ALL groups so they can match classified items.
  const bucketMap = new Map<string, number[]>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const groups = topicGroupsForClustering(item.topic);
    const windows = dayWindows(item.published_day);
    for (const g of groups) {
      for (const w of windows) {
        const key = `${g}|${w}`;
        let arr = bucketMap.get(key);
        if (!arr) {
          arr = [];
          bucketMap.set(key, arr);
        }
        arr.push(i);
      }
    }
  }

  // 2. Build rich term sets for every item
  const termSets = items.map(it => extractRichTerms(it.title));

  // 3. Union-find across each bucket
  const parent = items.map((_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  }
  function union(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (const indices of bucketMap.values()) {
    if (indices.length < 2) continue;
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const sim = weightedJaccard(termSets[indices[i]!]!, termSets[indices[j]!]!);
        if (sim >= MERGE_THRESHOLD) {
          union(indices[i]!, indices[j]!);
        }
      }
    }
  }

  // 4. Resolve final cluster ids
  return parent.map((_, i) => find(i));
}

// ── Term extraction ─────────────────────────────────────────────────────

export interface RichTermSet {
  /** Stemmed, synonym-expanded regular words */
  words: Set<string>;
  /** Entity tokens (prefixed: C:US, CITY:gaza, ORG:hamas, L:putin, etc.) */
  entities: Set<string>;
  /** Bigrams of stemmed words (joined with _) */
  bigrams: Set<string>;
}

/**
 * Build a rich term set from a headline. Combines stemming, synonym
 * expansion, entity extraction, and bigram generation.
 */
export function extractRichTerms(title: string): RichTermSet {
  const words = new Set<string>();
  const bigrams = new Set<string>();

  // Token-level processing: stem + synonym
  const rawWords = title
    .toLowerCase()
    .replace(/[^a-z0-9\s\-']/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));

  const processed: string[] = [];
  for (const w of rawWords) {
    const clean = w.replace(/['-]/g, '');
    if (!clean || clean.length < 2) continue;
    const stemmed = porterStem(clean);
    const canonical = canonicalSynonym(stemmed);
    words.add(canonical);
    processed.push(canonical);
  }

  // Bigrams for phrase-level signal
  for (let i = 0; i < processed.length - 1; i++) {
    bigrams.add(`${processed[i]}_${processed[i + 1]}`);
  }

  // Entity extraction
  const entities = entityTokens(extractEntities(title));

  return { words, entities, bigrams };
}

// ── Similarity ──────────────────────────────────────────────────────────

/**
 * Weighted Jaccard with entity boost.
 *
 * Entities (countries, cities, orgs, leaders) carry far more identity
 * signal than common nouns. Two headlines mentioning "Iran" and "Israel"
 * are almost certainly the same event even with zero other word overlap.
 *
 * Weights:
 *   - entities: 3× (strongest identity signal)
 *   - words:    1× (baseline)
 *   - bigrams:  0.5× (supplementary phrase-level signal)
 *
 * The formula uses weighted intersection / weighted union so that
 * shared entities pull the score up substantially.
 */
export function weightedJaccard(a: RichTermSet, b: RichTermSet): number {
  const wordInter = setIntersectionSize(a.words, b.words);
  const wordUnion = setUnionSize(a.words, b.words);

  const entInter = setIntersectionSize(a.entities, b.entities);
  const entUnion = setUnionSize(a.entities, b.entities);

  const biInter = setIntersectionSize(a.bigrams, b.bigrams);
  const biUnion = setUnionSize(a.bigrams, b.bigrams);

  const numerator = wordInter + 3 * entInter + 0.5 * biInter;
  const denominator = wordUnion + 3 * entUnion + 0.5 * biUnion;

  if (denominator === 0) return 0;
  return numerator / denominator;
}

function setIntersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const item of smaller) {
    if (larger.has(item)) count++;
  }
  return count;
}

function setUnionSize(a: Set<string>, b: Set<string>): number {
  return a.size + b.size - setIntersectionSize(a, b);
}

// ── Legacy compatibility ────────────────────────────────────────────────

/**
 * Extract key terms (legacy API — used by some downstream callers).
 * Now internally uses stemming + synonym expansion.
 */
export function extractKeyTerms(title: string): Set<string> {
  const rt = extractRichTerms(title);
  return new Set([...rt.words, ...rt.entities]);
}

/**
 * Compute similarity between two titles for cross-run signal matching.
 * Higher-level API that extracts terms and computes weighted Jaccard.
 */
export function titleSimilarity(titleA: string, titleB: string): number {
  return weightedJaccard(extractRichTerms(titleA), extractRichTerms(titleB));
}
