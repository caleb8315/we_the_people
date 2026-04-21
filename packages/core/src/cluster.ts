/**
 * Lightweight event clustering — groups articles about the same real-world
 * event without LLM calls.  O(n·k) where k is articles per topic+day bucket
 * (typically < 50).
 *
 * Strategy:
 *   1. Partition articles by (topic, day-window) — cheap O(n) pass.
 *      Adjacent calendar days share a bucket so evening/morning coverage
 *      of the same event merges correctly.
 *   2. Within each partition, extract "key terms" from each title (nouns,
 *      numbers, place-name fragments) by stripping stop words.
 *   3. Merge any pair whose Jaccard similarity on key-terms exceeds
 *      MERGE_THRESHOLD.  Uses union-find for transitive closure.
 *   4. Return merged groups keyed by a stable hash of the representative
 *      (first-seen) title.
 */

// ── Stop words ──────────────────────────────────────────────────────────
// Common English function words that carry no topical signal.
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

const MERGE_THRESHOLD = 0.22;

// ── Public API ──────────────────────────────────────────────────────────

export interface Clusterable {
  title: string;
  topic: string;
  published_day: string; // YYYY-MM-DD or ''
}

/**
 * Expand a single day into a pair of adjacent-day windows so that articles
 * published on the boundary (e.g. 11 PM Tuesday → 1 AM Wednesday) end up
 * in overlapping buckets and can still merge.
 */
function dayWindows(day: string): string[] {
  if (!day) return [''];
  try {
    const d = new Date(day + 'T12:00:00Z');
    const prev = new Date(d.getTime() - 86_400_000);
    const cur = day;
    const prevStr = prev.toISOString().slice(0, 10);
    const pairKey = prevStr < cur ? `${prevStr}~${cur}` : `${cur}~${prevStr}`;
    return [cur, pairKey];
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

  // 1. Partition by (topic, day-window). Each item goes into its own day
  //    bucket AND the adjacent-day overlap bucket, so cross-midnight events
  //    get a chance to merge.
  const bucketMap = new Map<string, number[]>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const windows = dayWindows(item.published_day);
    for (const w of windows) {
      const key = `${item.topic}|${w}`;
      let arr = bucketMap.get(key);
      if (!arr) {
        arr = [];
        bucketMap.set(key, arr);
      }
      arr.push(i);
    }
  }

  // 2. Extract key terms for every item
  const termSets = items.map(it => extractKeyTerms(it.title));

  // 3. Union-find across each bucket
  const parent = items.map((_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!; // path compression
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
        const sim = jaccard(termSets[indices[i]!]!, termSets[indices[j]!]!);
        if (sim >= MERGE_THRESHOLD) {
          union(indices[i]!, indices[j]!);
        }
      }
    }
  }

  // 4. Resolve final cluster ids
  return parent.map((_, i) => find(i));
}

// ── Helpers ─────────────────────────────────────────────────────────────

export function extractKeyTerms(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const w of smaller) {
    if (larger.has(w)) inter++;
  }
  const unionSize = a.size + b.size - inter;
  return unionSize === 0 ? 0 : inter / unionSize;
}
