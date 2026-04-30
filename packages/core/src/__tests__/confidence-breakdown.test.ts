import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConfidenceBreakdown,
} from '../confidence-breakdown';
import { rankSources, summarizeRankedSources } from '../source-ranking';
import {
  analyzeConflicts,
  summarizeConflicts,
} from '../conflict-analysis';
import {
  buildEvidenceCards,
  summarizeEvidenceCards,
} from '../evidence-cards';
import { buildResultExplanation } from '../result-explanation';
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

function buildEverything(opts: {
  evidence: EvidenceItem[];
  contradictions?: DetectedContradiction[];
  hasAnchor?: boolean;
  isTextOnly?: boolean;
  capAtMedium?: boolean;
}) {
  const ranked = rankSources({ evidence: opts.evidence });
  const ranked_summary = summarizeRankedSources(ranked);
  const conflicts = analyzeConflicts({
    contradictions: opts.contradictions ?? [],
    evidence: opts.evidence,
  });
  const conflict_summary = summarizeConflicts(conflicts);
  const cards = buildEvidenceCards({
    evidence: opts.evidence,
    ranked,
    contradictions: opts.contradictions ?? [],
  });
  const cards_summary = summarizeEvidenceCards(cards);
  const breakdown = buildConfidenceBreakdown({
    ranked,
    ranked_summary,
    conflicts,
    conflict_summary,
    cards_summary,
    has_anchor: opts.hasAnchor ?? false,
    is_text_only: opts.isTextOnly ?? false,
    cap_at_medium: opts.capAtMedium ?? false,
  });
  return { ranked, ranked_summary, conflicts, conflict_summary, cards_summary, breakdown };
}

describe('buildConfidenceBreakdown', () => {
  it('produces a 0-100 composite split into 4 components plus penalties', () => {
    const evidence = [
      ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true }),
      ev({ url: 'https://apnews.com/b', domain: 'apnews.com', is_credible: true }),
      ev({ url: 'https://bbc.com/c', domain: 'bbc.com', is_credible: true }),
      ev({ url: 'https://earthquake.usgs.gov/x', domain: 'earthquake.usgs.gov', source_id: 'usgs-quakes' }),
    ];
    const { breakdown } = buildEverything({ evidence });
    assert.ok(breakdown.composite >= 0 && breakdown.composite <= 100);
    assert.ok(breakdown.components.source_agreement.score >= 0);
    assert.ok(breakdown.components.source_quality.score >= 0);
    assert.ok(breakdown.components.claim_directness.score >= 0);
    assert.ok(breakdown.components.evidence_completeness.score >= 0);
    assert.equal(breakdown.band, 'high');
  });

  it('routes to contested when contradictions are present', () => {
    const evidence = [
      ev({ url: 'https://a.example/1', domain: 'a.example', is_credible: true }),
      ev({ url: 'https://b.example/1', domain: 'b.example', is_credible: true }),
      ev({ url: 'https://c.example/1', domain: 'c.example', is_credible: true }),
    ];
    const contradictions: DetectedContradiction[] = [
      {
        type: 'numeric_conflict',
        severity: 'high',
        summary: 'sources disagree',
        metadata: {
          a: { source: 'a.example', url: 'https://a.example/1', value: 5 },
          b: { source: 'b.example', url: 'https://b.example/1', value: 50 },
        },
        evidence_ids: [],
      },
    ];
    const { breakdown } = buildEverything({ evidence, contradictions });
    assert.equal(breakdown.band, 'contested');
  });

  it('lowers confidence when sources are weak / circular / incomplete (per upgrade plan)', () => {
    const sparse = buildEverything({
      evidence: [ev({ url: 'https://blog.example', domain: 'blog.example' })],
    });
    const wide = buildEverything({
      evidence: Array.from({ length: 6 }, (_, i) =>
        ev({ url: `https://outlet${i}.example`, domain: `outlet${i}.example`, is_credible: true }),
      ),
    });
    assert.ok(sparse.breakdown.composite < wide.breakdown.composite);
    assert.ok(sparse.breakdown.penalty > 0);
  });

  it('caps band at medium when cap_at_medium is true (e.g. social submissions)', () => {
    const evidence = Array.from({ length: 5 }, (_, i) =>
      ev({ url: `https://outlet${i}.example`, domain: `outlet${i}.example`, is_credible: true }),
    );
    const { breakdown } = buildEverything({ evidence, capAtMedium: true });
    assert.notEqual(breakdown.band, 'high');
  });
});

describe('buildResultExplanation', () => {
  it('produces all four reader-facing sections plus a positioning sentence', () => {
    const evidence = [
      ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true }),
      ev({ url: 'https://apnews.com/b', domain: 'apnews.com', is_credible: true }),
    ];
    const { breakdown, ranked_summary, conflicts, conflict_summary, cards_summary } =
      buildEverything({ evidence });
    const explanation = buildResultExplanation({
      band: breakdown.band,
      breakdown,
      ranked_summary,
      conflicts,
      conflict_summary,
      cards_summary,
      has_anchor: false,
      is_text_only: false,
      is_social: false,
    });
    assert.ok(explanation.why_this_result.length > 0);
    assert.ok(explanation.what_would_resolve_this.length > 0);
    assert.ok(explanation.what_sources_agree_on.length > 0);
    assert.ok(explanation.what_sources_disagree_on.length > 0);
    assert.match(
      explanation.positioning,
      /compare|comparison|evidence|transparency/i,
    );
  });
});
