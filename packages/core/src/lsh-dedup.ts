/**
 * Locality-Sensitive Hashing (MinHash + LSH index) for near-duplicate
 * detection across ingest runs.
 *
 * Over time, cluster drift can cause the same event to spawn multiple
 * signals if headline wording shifts gradually (A≈B, B≈C, but A≉C).
 * LSH catches these by maintaining a persistent signature index and
 * detecting near-duplicates in sub-linear time.
 *
 * Implementation: zero dependencies. Uses the MinHash algorithm with
 * universal hashing and banded LSH for fast candidate retrieval.
 *
 * The index can be serialised to JSON for persistence between runs.
 */

const DEFAULT_NUM_PERM = 128;
const DEFAULT_NUM_BANDS = 16;

// ── Universal hash functions ────────────────────────────────────────────

const PRIME = 2147483647; // Mersenne prime 2^31 - 1
const MAX_HASH = 2 ** 32 - 1;

function generateHashParams(numPerm: number, seed: number = 42): Array<[number, number]> {
  const params: Array<[number, number]> = [];
  let rng = seed;
  for (let i = 0; i < numPerm; i++) {
    rng = (rng * 1664525 + 1013904223) & 0xFFFFFFFF;
    const a = (rng % (PRIME - 1)) + 1;
    rng = (rng * 1664525 + 1013904223) & 0xFFFFFFFF;
    const b = rng % PRIME;
    params.push([a, b]);
  }
  return params;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) & 0xFFFFFFFF;
  }
  return h >>> 0;
}

// ── MinHash signature ───────────────────────────────────────────────────

export class MinHashSignature {
  readonly values: Uint32Array;

  constructor(numPerm: number = DEFAULT_NUM_PERM) {
    this.values = new Uint32Array(numPerm).fill(MAX_HASH);
  }

  static fromTokens(
    tokens: Iterable<string>,
    hashParams: Array<[number, number]>,
  ): MinHashSignature {
    const sig = new MinHashSignature(hashParams.length);
    for (const token of tokens) {
      const h = hashString(token);
      for (let i = 0; i < hashParams.length; i++) {
        const [a, b] = hashParams[i]!;
        const hashed = ((a * h + b) % PRIME) >>> 0;
        if (hashed < sig.values[i]!) {
          sig.values[i] = hashed;
        }
      }
    }
    return sig;
  }

  jaccard(other: MinHashSignature): number {
    let agree = 0;
    for (let i = 0; i < this.values.length; i++) {
      if (this.values[i] === other.values[i]) agree++;
    }
    return agree / this.values.length;
  }

  toJSON(): number[] {
    return Array.from(this.values);
  }

  static fromJSON(data: number[]): MinHashSignature {
    const sig = new MinHashSignature(data.length);
    for (let i = 0; i < data.length; i++) {
      sig.values[i] = data[i]!;
    }
    return sig;
  }
}

// ── LSH Index ───────────────────────────────────────────────────────────

export interface LshEntry {
  key: string;
  signature: MinHashSignature;
}

export class LshIndex {
  private numBands: number;
  private rowsPerBand: number;
  private buckets: Map<string, Set<string>>[];
  private entries: Map<string, MinHashSignature>;

  constructor(numPerm: number = DEFAULT_NUM_PERM, numBands: number = DEFAULT_NUM_BANDS) {
    this.numBands = numBands;
    this.rowsPerBand = Math.floor(numPerm / numBands);
    this.buckets = [];
    for (let i = 0; i < numBands; i++) {
      this.buckets.push(new Map());
    }
    this.entries = new Map();
  }

  insert(key: string, sig: MinHashSignature): void {
    this.entries.set(key, sig);
    for (let band = 0; band < this.numBands; band++) {
      const bandHash = this.bandHash(sig, band);
      let bucket = this.buckets[band]!.get(bandHash);
      if (!bucket) {
        bucket = new Set();
        this.buckets[band]!.set(bandHash, bucket);
      }
      bucket.add(key);
    }
  }

  /**
   * Find candidate near-duplicates for the given signature.
   * Returns keys of entries that share at least one band hash.
   * Verify with actual Jaccard before acting on results.
   */
  query(sig: MinHashSignature, excludeKey?: string): string[] {
    const candidates = new Set<string>();
    for (let band = 0; band < this.numBands; band++) {
      const bandHash = this.bandHash(sig, band);
      const bucket = this.buckets[band]!.get(bandHash);
      if (bucket) {
        for (const key of bucket) {
          if (key !== excludeKey) candidates.add(key);
        }
      }
    }
    return [...candidates];
  }

  /**
   * Query and return results sorted by estimated Jaccard similarity.
   */
  querySorted(sig: MinHashSignature, minSimilarity: number = 0.5, excludeKey?: string): Array<{ key: string; similarity: number }> {
    const candidateKeys = this.query(sig, excludeKey);
    const results: Array<{ key: string; similarity: number }> = [];
    for (const key of candidateKeys) {
      const entrySig = this.entries.get(key);
      if (!entrySig) continue;
      const sim = sig.jaccard(entrySig);
      if (sim >= minSimilarity) {
        results.push({ key, similarity: sim });
      }
    }
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  getSignature(key: string): MinHashSignature | undefined {
    return this.entries.get(key);
  }

  get size(): number {
    return this.entries.size;
  }

  private bandHash(sig: MinHashSignature, band: number): string {
    const start = band * this.rowsPerBand;
    const end = start + this.rowsPerBand;
    let h = 0;
    for (let i = start; i < end && i < sig.values.length; i++) {
      h = ((h * 31) + sig.values[i]!) & 0xFFFFFFFF;
    }
    return `${band}:${h}`;
  }
}

// ── Convenience: build MinHash from headline terms ──────────────────────

let cachedParams: Array<[number, number]> | null = null;

export function getHashParams(numPerm: number = DEFAULT_NUM_PERM): Array<[number, number]> {
  if (cachedParams && cachedParams.length === numPerm) return cachedParams;
  cachedParams = generateHashParams(numPerm);
  return cachedParams;
}

/**
 * Create a MinHash signature from a headline string.
 * Uses word-level shingles (tokens) from the extractRichTerms pipeline.
 */
export function signatureFromTerms(terms: Set<string>): MinHashSignature {
  return MinHashSignature.fromTokens(terms, getHashParams());
}
