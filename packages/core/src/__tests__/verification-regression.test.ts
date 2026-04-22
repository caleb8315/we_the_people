import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeStatus, decideVerification, isNonKineticContext } from '../verification';
import {
  buildReliabilitySummary,
  computeReliabilityScores,
  reliabilityPublicLabel,
} from '../scoring';
import type { EvidenceItem } from '../types';

/**
 * Regression locks for the verification contract that the Confidence Report
 * depends on. These tests exist to prevent silent drift in the math as we
 * refactor the UI to the unified contract in Phases 1+.
 */

function ev(domain: string, isCredible: boolean): EvidenceItem {
  return {
    source_id: null,
    url: `https://${domain}/x`,
    domain,
    title: 't',
    published_at: null,
    is_credible: isCredible,
    excerpt: null,
  };
}

describe('computeStatus thresholds (regression lock)', () => {
  it('corroborates when 2+ credible domains and 2+ sources are present', () => {
    assert.equal(computeStatus(3, 2), 'verified');
    assert.equal(computeStatus(2, 2), 'verified');
  });

  it('downgrades to developing when only one credible is present', () => {
    assert.equal(computeStatus(3, 1), 'developing');
  });

  it('quarantines when there is no credible source and a single outlet', () => {
    assert.equal(computeStatus(1, 0), 'quarantined');
  });
});

describe('decideVerification', () => {
  it('produces a decision log with sources and credible counts', () => {
    const d = decideVerification('Event happened', 'details', [
      ev('reuters.com', true),
      ev('apnews.com', true),
      ev('somerandom.biz', false),
    ]);
    assert.equal(d.status, 'verified');
    assert.equal(d.credible_source_count, 2);
    assert.equal(d.source_count, 3);
    assert.ok(d.decision_log.some((line) => line.startsWith('initial=')));
  });

  it('overrides to quarantined on non-kinetic policy language', () => {
    const d = decideVerification(
      'Supreme court rules on LGBT case',
      'Policy decision with no kinetic event',
      [ev('reuters.com', true), ev('bbc.com', true)],
    );
    assert.equal(d.status, 'quarantined');
    assert.ok(d.decision_log.some((line) => line.includes('non-kinetic')));
  });
});

describe('isNonKineticContext', () => {
  it('detects policy/legal wording without kinetic evidence', () => {
    assert.equal(isNonKineticContext('Supreme court ruling on civil rights lawsuit'), true);
  });

  it('does not trip on kinetic events mentioning policy secondarily', () => {
    assert.equal(
      isNonKineticContext('Airstrike killed dozens despite ceasefire policy talks'),
      false,
    );
  });
});

describe('reliability composite (regression lock)', () => {
  it('awards high reliability when multiple credible sources agree with sensor corroboration', () => {
    const evidence: EvidenceItem[] = [
      ev('reuters.com', true),
      ev('apnews.com', true),
      ev('earthquake.usgs.gov', true),
    ];
    const r = computeReliabilityScores({
      evidence,
      claims: [],
      contradictions: [],
    });
    assert.ok(r.reliability_score >= 70);
    assert.equal(reliabilityPublicLabel(r.reliability_score), 'LIKELY_ACCURATE');
  });

  it('penalises heavily when contradictions are present', () => {
    const evidence: EvidenceItem[] = [
      ev('reuters.com', true),
      ev('apnews.com', true),
    ];
    const r = computeReliabilityScores({
      evidence,
      claims: [],
      contradictions: [
        {
          type: 'numeric_conflict',
          severity: 'high',
          summary: 'conflict',
          metadata: {},
          evidence_ids: [],
        },
      ],
    });
    assert.ok(r.reliability_score < 70);
    assert.ok(r.narrative_divergence_score >= 25);
  });
});

describe('buildReliabilitySummary priority order (regression lock)', () => {
  it('prioritizes contradiction-aware language', () => {
    assert.equal(
      buildReliabilitySummary({
        contradictions_count: 1,
        evidence_strength_score: 80,
        agreement_score: 100,
      }),
      'Sources report conflicting information.',
    );
  });

  it('falls back to limited-evidence language when signals are weak', () => {
    assert.equal(
      buildReliabilitySummary({
        contradictions_count: 0,
        evidence_strength_score: 10,
        agreement_score: 50,
      }),
      'Limited independent evidence available.',
    );
  });

  it('uses agreement language when consensus is high and no contradictions', () => {
    assert.equal(
      buildReliabilitySummary({
        contradictions_count: 0,
        evidence_strength_score: 60,
        agreement_score: 90,
      }),
      'Multiple sources report consistent details.',
    );
  });
});
