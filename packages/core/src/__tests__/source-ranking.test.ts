import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankSources, summarizeRankedSources } from '../source-ranking';
import type { EvidenceItem } from '../types';

function ev(partial: Partial<EvidenceItem>): EvidenceItem {
  return {
    source_id: null,
    url: 'https://example.com/x',
    domain: 'example.com',
    title: 'Example title',
    published_at: null,
    is_credible: false,
    excerpt: null,
    ...partial,
  };
}

const NOW = Date.parse('2026-04-01T12:00:00Z');

describe('rankSources', () => {
  it('promotes sensor / official primary sources to the top of the ranking', () => {
    const ranked = rankSources({
      evidence: [
        ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true }),
        ev({
          url: 'https://earthquake.usgs.gov/event/x',
          domain: 'earthquake.usgs.gov',
          source_id: 'usgs-quakes',
        }),
        ev({ url: 'https://blog.example/x', domain: 'blog.example' }),
      ],
      now_ms: NOW,
    });
    assert.equal(ranked[0]?.role, 'primary');
    assert.equal(ranked[0]?.is_primary, true);
    assert.ok((ranked[0]?.score ?? 0) >= (ranked[1]?.score ?? 0));
  });

  it('exposes per-source reasons and component sub-scores', () => {
    const ranked = rankSources({
      evidence: [
        ev({
          url: 'https://reuters.com/a',
          domain: 'reuters.com',
          is_credible: true,
          published_at: new Date(NOW - 2 * 36e5).toISOString(),
        }),
      ],
      now_ms: NOW,
    });
    const top = ranked[0]!;
    assert.equal(typeof top.score, 'number');
    assert.equal(typeof top.components.credibility, 'number');
    assert.equal(typeof top.components.directness, 'number');
    assert.equal(typeof top.components.recency, 'number');
    assert.equal(typeof top.components.independence, 'number');
    assert.ok(top.reasons.length >= 1);
    assert.ok(top.reasons.some((r) => /rated[- ]outlet|recent|first[- ]party|independent|publish/i.test(r.text)));
  });

  it('flags brand-family duplicates as syndicated and lowers their independence', () => {
    const ranked = rankSources({
      evidence: [
        ev({ url: 'https://cnn.com/a', domain: 'cnn.com', is_credible: true }),
        ev({ url: 'https://edition.cnn.com/b', domain: 'edition.cnn.com', is_credible: true }),
      ],
      now_ms: NOW,
    });
    const sharedOwner = ranked.find((r) => r.is_syndicated);
    assert.ok(sharedOwner, 'expected at least one source to be marked syndicated');
    assert.ok(
      sharedOwner!.components.independence <= 50,
      'shared-owner sources should have low independence sub-score',
    );
  });

  it('penalizes older sources but never assigns negative scores', () => {
    const ranked = rankSources({
      evidence: [
        ev({
          url: 'https://reuters.com/a',
          domain: 'reuters.com',
          is_credible: true,
          published_at: new Date(NOW - 24 * 36e5 * 365 * 2).toISOString(),
        }),
      ],
      now_ms: NOW,
    });
    const top = ranked[0]!;
    assert.ok(top.score >= 0);
    assert.ok(top.components.recency <= 30);
    assert.ok(top.reasons.some((r) => /older|stale|background/i.test(r.text)));
  });

  it('produces a deterministic, ranked list (stable for ties)', () => {
    const evList = [
      ev({ url: 'https://a.example', domain: 'a.example' }),
      ev({ url: 'https://b.example', domain: 'b.example' }),
      ev({ url: 'https://c.example', domain: 'c.example' }),
    ];
    const r1 = rankSources({ evidence: evList, now_ms: NOW });
    const r2 = rankSources({ evidence: evList, now_ms: NOW });
    assert.deepEqual(
      r1.map((r) => r.url),
      r2.map((r) => r.url),
    );
  });
});

describe('summarizeRankedSources', () => {
  it('counts primaries, officials, rated outlets, social, and aggregator entries separately', () => {
    const ranked = rankSources({
      evidence: [
        ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true }),
        ev({ url: 'https://earthquake.usgs.gov/x', domain: 'earthquake.usgs.gov' }),
        ev({ url: 'https://who.int/x', domain: 'who.int' }),
        ev({ url: 'https://reddit.com/r/x', domain: 'reddit.com' }),
        ev({ url: 'https://news.google.com/x', domain: 'news.google.com' }),
      ],
      now_ms: NOW,
    });
    const sum = summarizeRankedSources(ranked);
    assert.equal(sum.total, 5);
    assert.equal(sum.primaries, 1);
    assert.equal(sum.officials, 1);
    assert.equal(sum.rated_outlets, 1);
    assert.equal(sum.social_posts, 1);
    assert.equal(sum.aggregators, 1);
  });
});
