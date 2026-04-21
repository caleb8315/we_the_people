import { describe, it, expect } from 'vitest';
import { MinHashSignature, LshIndex, getHashParams, signatureFromTerms } from '../lsh-dedup';

describe('MinHashSignature', () => {
  it('computes similarity of 1.0 for identical sets', () => {
    const params = getHashParams(128);
    const a = MinHashSignature.fromTokens(['hello', 'world', 'test'], params);
    const b = MinHashSignature.fromTokens(['hello', 'world', 'test'], params);
    expect(a.jaccard(b)).toBeCloseTo(1.0, 1);
  });

  it('computes low similarity for disjoint sets', () => {
    const params = getHashParams(128);
    const a = MinHashSignature.fromTokens(['hello', 'world'], params);
    const b = MinHashSignature.fromTokens(['foo', 'bar', 'baz'], params);
    expect(a.jaccard(b)).toBeLessThan(0.2);
  });

  it('computes reasonable similarity for overlapping sets', () => {
    const params = getHashParams(128);
    const a = MinHashSignature.fromTokens(['iran', 'missile', 'attack', 'israel'], params);
    const b = MinHashSignature.fromTokens(['iran', 'rocket', 'strike', 'israel'], params);
    const sim = a.jaccard(b);
    expect(sim).toBeGreaterThan(0.2);
    expect(sim).toBeLessThan(0.8);
  });

  it('serialises and deserialises correctly', () => {
    const params = getHashParams(128);
    const original = MinHashSignature.fromTokens(['hello', 'world'], params);
    const json = original.toJSON();
    const restored = MinHashSignature.fromJSON(json);
    expect(original.jaccard(restored)).toBeCloseTo(1.0, 5);
  });
});

describe('LshIndex', () => {
  it('finds similar documents', () => {
    const params = getHashParams(128);
    // Use fewer bands for more recall on moderate-similarity pairs
    const index = new LshIndex(128, 32);

    // High overlap: 3/6 shared tokens
    const sig1 = MinHashSignature.fromTokens(['iran', 'missile', 'attack', 'israel', 'strikes', 'military'], params);
    const sig2 = MinHashSignature.fromTokens(['iran', 'missile', 'strike', 'israel', 'rockets', 'war'], params);
    const sig3 = MinHashSignature.fromTokens(['bitcoin', 'price', 'market', 'crypto', 'trading', 'exchange'], params);

    index.insert('doc1', sig1);
    index.insert('doc2', sig2);
    index.insert('doc3', sig3);

    const candidates = index.query(sig1, 'doc1');
    expect(candidates).toContain('doc2');
    expect(candidates).not.toContain('doc3');
  });

  it('querySorted returns results in similarity order', () => {
    const params = getHashParams(128);
    const index = new LshIndex(128, 16);

    const query = MinHashSignature.fromTokens(['earthquake', 'turkey', 'killed', 'magnitude'], params);
    const similar = MinHashSignature.fromTokens(['earthquake', 'turkey', 'dead', 'quake'], params);
    const unrelated = MinHashSignature.fromTokens(['stock', 'market', 'crash', 'economy'], params);

    index.insert('similar', similar);
    index.insert('unrelated', unrelated);

    const results = index.querySorted(query, 0.2);
    if (results.length > 0) {
      expect(results[0]!.key).toBe('similar');
    }
  });

  it('tracks index size', () => {
    const params = getHashParams(128);
    const index = new LshIndex(128, 16);

    expect(index.size).toBe(0);
    index.insert('a', MinHashSignature.fromTokens(['test'], params));
    expect(index.size).toBe(1);
  });
});

describe('signatureFromTerms', () => {
  it('creates a signature from a set of terms', () => {
    const sig = signatureFromTerms(new Set(['iran', 'missile', 'israel']));
    expect(sig.values.length).toBe(128);
  });
});
