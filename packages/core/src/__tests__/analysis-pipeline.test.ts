import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankSources, summarizeRankedSources } from '../source-ranking';
import { analyzeConflicts, summarizeConflicts } from '../conflict-analysis';
import { detectCorpusBias } from '../bias';
import { buildEvidenceCards, summarizeEvidenceCards } from '../evidence-cards';
import { buildConfidenceBreakdown } from '../confidence-breakdown';
import { buildResultExplanation } from '../result-explanation';
import type { EvidenceItem } from '../types';
import type { DetectedContradiction } from '../contradictions';

/**
 * Integration test for the full analysis pipeline the worker runs at
 * ingest time and the signal page falls back to live. Asserts that
 * every module composes cleanly, the JSONB blobs that get persisted
 * are deterministic, and the pipeline does not regress on the upgrade
 * plan's hard rules — bias never moves the confidence breakdown,
 * primaries always lead the ranked list, and the result explanation
 * always includes all four reader sections.
 */

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

function buildPipeline(opts: {
  evidence: EvidenceItem[];
  contradictions?: DetectedContradiction[];
  claimTitle?: string;
  claimText?: string;
  hasAnchor?: boolean;
  isTextOnly?: boolean;
  isSocial?: boolean;
}) {
  const ranked = rankSources({ evidence: opts.evidence });
  const ranked_summary = summarizeRankedSources(ranked);
  const conflicts = analyzeConflicts({
    contradictions: opts.contradictions ?? [],
    evidence: opts.evidence,
    claim_title: opts.claimTitle ?? null,
    claim_text: opts.claimText ?? null,
  });
  const conflict_summary = summarizeConflicts(conflicts);
  const evidence_cards = buildEvidenceCards({
    evidence: opts.evidence,
    ranked,
    contradictions: opts.contradictions ?? [],
  });
  const cards_summary = summarizeEvidenceCards(evidence_cards);
  const bias = detectCorpusBias(
    opts.evidence.map((e) => `${e.title ?? ''} ${e.excerpt ?? ''}`),
  );
  const breakdown = buildConfidenceBreakdown({
    ranked,
    ranked_summary,
    conflicts,
    conflict_summary,
    cards_summary,
    has_anchor: opts.hasAnchor ?? false,
    is_text_only: opts.isTextOnly ?? false,
    cap_at_medium: false,
  });
  const explanation = buildResultExplanation({
    band: breakdown.band,
    breakdown,
    ranked_summary,
    conflicts,
    conflict_summary,
    cards_summary,
    has_anchor: opts.hasAnchor ?? false,
    is_text_only: opts.isTextOnly ?? false,
    is_social: opts.isSocial ?? false,
  });
  return { ranked, ranked_summary, conflicts, conflict_summary, evidence_cards, cards_summary, bias, breakdown, explanation };
}

describe('analysis pipeline (worker / signal page integration)', () => {
  it('produces a fully-populated, deterministic analysis bundle for a strong corpus', () => {
    const evidence = [
      ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true, title: 'Reuters story' }),
      ev({ url: 'https://apnews.com/b', domain: 'apnews.com', is_credible: true, title: 'AP report' }),
      ev({ url: 'https://bbc.com/c', domain: 'bbc.com', is_credible: true, title: 'BBC coverage' }),
      ev({ url: 'https://earthquake.usgs.gov/x', domain: 'earthquake.usgs.gov', source_id: 'usgs-quakes', title: 'USGS event detail' }),
    ];
    const r1 = buildPipeline({ evidence });
    const r2 = buildPipeline({ evidence });
    // Determinism: pipeline output is identical across runs on identical input.
    assert.deepEqual(r1.breakdown, r2.breakdown);
    assert.deepEqual(r1.explanation, r2.explanation);

    // Strong corpus must rank a primary first.
    assert.equal(r1.ranked[0]?.role, 'primary');
    assert.equal(r1.breakdown.band, 'high');
    assert.ok(r1.explanation.why_this_result.length > 0);
    assert.ok(r1.explanation.what_would_resolve_this.length > 0);
    assert.ok(r1.explanation.what_sources_agree_on.length > 0);
    assert.ok(r1.explanation.what_sources_disagree_on.length > 0);
  });

  it('routes to contested when contradictions are present, regardless of source quality', () => {
    const evidence = [
      ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true, title: '50 dead in attack' }),
      ev({ url: 'https://apnews.com/b', domain: 'apnews.com', is_credible: true, title: '5 dead in incident' }),
      ev({ url: 'https://bbc.com/c', domain: 'bbc.com', is_credible: true, title: 'Authorities investigating' }),
    ];
    const contradictions: DetectedContradiction[] = [
      {
        type: 'numeric_conflict',
        severity: 'high',
        summary: 'Reuters reports ~50; AP reports ~5.',
        metadata: {
          a: { source: 'reuters.com', url: 'https://reuters.com/a', value: 50 },
          b: { source: 'apnews.com', url: 'https://apnews.com/b', value: 5 },
          ratio: 10,
        },
        evidence_ids: [],
      },
    ];
    const r = buildPipeline({ evidence, contradictions });
    assert.equal(r.breakdown.band, 'contested');
    // Cards involved in the contradiction are flagged disputes.
    const disputes = r.evidence_cards.filter((c) => c.stance === 'disputes');
    assert.ok(disputes.length >= 2);
  });

  it('treats bias as a signal, not a verdict — bias never moves the confidence composite', () => {
    const neutralEvidence = [
      ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true, title: 'Authorities reported a fire at the warehouse.' }),
      ev({ url: 'https://apnews.com/b', domain: 'apnews.com', is_credible: true, title: 'Local fire department responded to a warehouse fire.' }),
      ev({ url: 'https://bbc.com/c', domain: 'bbc.com', is_credible: true, title: 'Investigation ongoing into warehouse fire cause.' }),
    ];
    // Same evidence rows, but with shouty / loaded language stuffed into excerpts.
    const biasedEvidence = neutralEvidence.map((e) => ({
      ...e,
      excerpt:
        'SHOCKING regime extremists carried out a devastating, terrifying, outrageous attack — critics say the slaughter is unprecedented.',
    }));
    const neutral = buildPipeline({ evidence: neutralEvidence });
    const biased = buildPipeline({ evidence: biasedEvidence });
    // Bias intensity goes up.
    assert.ok(biased.bias.avg_intensity > neutral.bias.avg_intensity);
    // But confidence breakdown composite is identical (bias is decoupled).
    assert.equal(biased.breakdown.composite, neutral.breakdown.composite);
    assert.equal(biased.breakdown.band, neutral.breakdown.band);
  });

  it('flags missing context when the claim names actors/numbers absent from the corpus', () => {
    const evidence = [
      ev({ url: 'https://a.example/1', domain: 'a.example', title: 'A localized event reported.', excerpt: 'Local authorities are investigating.' }),
      ev({ url: 'https://b.example/1', domain: 'b.example', title: 'Investigation continues.', excerpt: 'No further information at this time.' }),
      ev({ url: 'https://c.example/1', domain: 'c.example', title: 'Statement released.', excerpt: 'Officials issued a brief statement.' }),
    ];
    const r = buildPipeline({
      evidence,
      claimTitle: 'Senator Doe and Mayor Smith report 1,500 casualties in the Riverside district',
    });
    const mc = r.conflicts.find((c) => c.type === 'missing_context');
    assert.ok(mc, 'expected a missing_context conflict');
    // Penalty must be reflected in the completeness component.
    assert.ok(r.breakdown.components.evidence_completeness.score < 80);
  });

  it('lowers confidence for circular corpora (shared brand families / wire syndication)', () => {
    const independentEvidence = [
      ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true }),
      ev({ url: 'https://apnews.com/b', domain: 'apnews.com', is_credible: true }),
      ev({ url: 'https://bbc.com/c', domain: 'bbc.com', is_credible: true }),
    ];
    const circularEvidence = [
      ev({ url: 'https://cnn.com/a', domain: 'cnn.com', is_credible: true }),
      ev({ url: 'https://edition.cnn.com/b', domain: 'edition.cnn.com', is_credible: true }),
      ev({ url: 'https://media.cnn.com/c', domain: 'media.cnn.com', is_credible: true }),
    ];
    const independent = buildPipeline({ evidence: independentEvidence });
    const circular = buildPipeline({ evidence: circularEvidence });
    assert.ok(
      circular.breakdown.composite < independent.breakdown.composite,
      'circular corpus must score lower than independent corpus of the same size',
    );
    assert.ok(circular.breakdown.penalty > 0);
    assert.ok(circular.breakdown.penalty_reasons.length > 0);
  });

  it('always returns all four explanation sections + a positioning sentence', () => {
    const sparseEvidence = [
      ev({ url: 'https://blog.example', domain: 'blog.example', title: 'A blog post mentioning something.' }),
    ];
    const r = buildPipeline({ evidence: sparseEvidence });
    // Even with one source, every section is present — possibly with
    // "comparison too thin" copy, but never empty.
    assert.ok(r.explanation.why_this_result.length > 0);
    assert.ok(r.explanation.what_would_resolve_this.length > 0);
    assert.ok(r.explanation.what_sources_agree_on.length > 0);
    assert.ok(r.explanation.what_sources_disagree_on.length > 0);
    assert.match(r.explanation.positioning, /compare|comparison|evidence|transparency/i);
  });
});
