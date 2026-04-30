import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceCards, summarizeEvidenceCards } from '../evidence-cards';
import { rankSources } from '../source-ranking';
import type { EvidenceItem } from '../types';
import type { DetectedContradiction } from '../contradictions';

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

describe('buildEvidenceCards', () => {
  it('produces one card per evidence URL with a stance, explanation, and rank', () => {
    const evidence = [
      ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true, title: 'Reuters story' }),
      ev({ url: 'https://earthquake.usgs.gov/x', domain: 'earthquake.usgs.gov', source_id: 'usgs-quakes' }),
      ev({ url: 'https://en.wikipedia.org/wiki/Topic', domain: 'en.wikipedia.org' }),
    ];
    const ranked = rankSources({ evidence });
    const cards = buildEvidenceCards({ evidence, ranked, contradictions: [] });
    assert.equal(cards.length, 3);
    for (const c of cards) {
      assert.ok(['supports', 'disputes', 'neutral', 'context'].includes(c.stance));
      assert.ok(c.explanation.length > 0);
      assert.ok(typeof c.rank === 'number');
    }
    const wiki = cards.find((c) => c.domain.includes('wikipedia'))!;
    assert.equal(wiki.stance, 'context');
  });

  it('marks evidence rows involved in contradictions as "disputes"', () => {
    const evidence = [
      ev({ url: 'https://a.example/1', domain: 'a.example' }),
      ev({ url: 'https://b.example/1', domain: 'b.example' }),
    ];
    const contradictions: DetectedContradiction[] = [
      {
        type: 'numeric_conflict',
        severity: 'high',
        summary: 'sources disagree',
        metadata: { a: { source: 'a.example', url: 'https://a.example/1', value: 5 }, b: { source: 'b.example', url: 'https://b.example/1', value: 50 } },
        evidence_ids: [],
      },
    ];
    const ranked = rankSources({ evidence });
    const cards = buildEvidenceCards({ evidence, ranked, contradictions });
    assert.equal(cards.length, 2);
    for (const c of cards) {
      assert.equal(c.stance, 'disputes');
    }
  });

  it('summarizes stance counts', () => {
    const evidence = [
      ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true }),
      ev({ url: 'https://earthquake.usgs.gov/x', domain: 'earthquake.usgs.gov', source_id: 'usgs-quakes' }),
      ev({ url: 'https://en.wikipedia.org/wiki/Topic', domain: 'en.wikipedia.org' }),
    ];
    const ranked = rankSources({ evidence });
    const cards = buildEvidenceCards({ evidence, ranked, contradictions: [] });
    const sum = summarizeEvidenceCards(cards);
    assert.equal(sum.total, 3);
    assert.equal(
      sum.supports + sum.disputes + sum.context + sum.neutral,
      3,
    );
  });
});
