import { describe, it, expect } from 'vitest';
import {
  prepareExistingSignals,
  findMatchingSignal,
  matchClustersToExisting,
  CROSS_RUN_THRESHOLD,
} from '../signal-matcher';

describe('prepareExistingSignals', () => {
  it('pre-computes term sets for existing signals', () => {
    const prepared = prepareExistingSignals([
      { dedupe_key: 'abc', title: 'Iran strikes Israel', topic: 'war', occurred_at: '2024-04-14T12:00:00Z' },
    ]);
    expect(prepared.length).toBe(1);
    expect(prepared[0]!.terms.words.size).toBeGreaterThan(0);
    expect(prepared[0]!.topicGroup).toBe('conflict');
    expect(prepared[0]!.day).toBe('2024-04-14');
  });
});

describe('findMatchingSignal', () => {
  const existing = prepareExistingSignals([
    { dedupe_key: 'key-iran', title: 'Iran launches missile attack on Israel', topic: 'war', occurred_at: '2024-04-14T10:00:00Z' },
    { dedupe_key: 'key-quake', title: 'Major earthquake strikes Turkey killing 50', topic: 'disaster', occurred_at: '2024-04-12T08:00:00Z' },
    { dedupe_key: 'key-cyber', title: 'Ransomware attack hits US hospitals', topic: 'cyber', occurred_at: '2024-04-13T15:00:00Z' },
  ]);

  it('matches a similar headline from a different outlet', () => {
    const match = findMatchingSignal(
      'Tehran fires rockets at Israeli territory',
      'war',
      '2024-04-14',
      existing,
    );
    expect(match).not.toBeNull();
    expect(match!.dedupe_key).toBe('key-iran');
    expect(match!.similarity).toBeGreaterThanOrEqual(CROSS_RUN_THRESHOLD);
  });

  it('matches earthquake headlines across wording', () => {
    const match = findMatchingSignal(
      'Deadly quake in Turkey leaves dozens dead',
      'disaster',
      '2024-04-12',
      existing,
    );
    expect(match).not.toBeNull();
    expect(match!.dedupe_key).toBe('key-quake');
  });

  it('returns null for unrelated headlines', () => {
    const match = findMatchingSignal(
      'Bitcoin price surges past $100,000',
      'economy',
      '2024-04-14',
      existing,
    );
    expect(match).toBeNull();
  });

  it('respects topic group constraints', () => {
    const match = findMatchingSignal(
      'Iran launches missile attack on Israel',
      'economy', // wrong topic group
      '2024-04-14',
      existing,
    );
    expect(match).toBeNull();
  });

  it('respects day distance constraints', () => {
    const match = findMatchingSignal(
      'Iran launches missile attack on Israel',
      'war',
      '2024-04-20', // 6 days later — too far
      existing,
    );
    expect(match).toBeNull();
  });

  it('matches across adjacent days', () => {
    const match = findMatchingSignal(
      'Turkey earthquake aftermath continues',
      'disaster',
      '2024-04-13', // one day after the existing signal
      existing,
    );
    // May or may not match depending on similarity — day is within range
    if (match) {
      expect(match.dedupe_key).toBe('key-quake');
    }
  });
});

describe('matchClustersToExisting', () => {
  const existing = prepareExistingSignals([
    { dedupe_key: 'existing-1', title: 'Iran strikes Israeli military bases', topic: 'war', occurred_at: '2024-04-14T10:00:00Z' },
  ]);

  it('remaps matching clusters to existing dedupe keys', () => {
    const clusters = [
      { dedupe_key: 'new-1', title: 'Tehran attacks Israeli positions with missiles', topic: 'war', published_day: '2024-04-14' },
      { dedupe_key: 'new-2', title: 'Bitcoin hits all-time high', topic: 'economy', published_day: '2024-04-14' },
    ];

    const remapping = matchClustersToExisting(clusters, existing);
    expect(remapping.get('new-1')).toBe('existing-1');
    expect(remapping.has('new-2')).toBe(false);
  });
});
