import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTrustExplanation,
  isPlainTrustSafe,
  FORBIDDEN_TRUST_PHRASES,
} from '../trust-explainer';
import { buildConfidenceReport } from '../confidence';
import type { EvidenceItem } from '../types';
import type { DetectedContradiction } from '../contradictions';
import type { PhysicalEvidence } from '../evidence';

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

function highReport() {
  return buildConfidenceReport({
    verification_status: 'verified',
    reliability_score: 80,
    reliability_label: 'LIKELY_ACCURATE',
    source_count: 4,
    credible_source_count: 4,
    evidence: [
      ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true }),
      ev({ url: 'https://apnews.com/b', domain: 'apnews.com', is_credible: true }),
      ev({ url: 'https://bbc.com/c', domain: 'bbc.com', is_credible: true }),
      ev({ url: 'https://cnn.com/d', domain: 'cnn.com', is_credible: true }),
    ],
    contradictions: [],
    physical_evidence: null,
  });
}

function contestedReport() {
  const contra: DetectedContradiction = {
    type: 'cause_conflict',
    severity: 'medium',
    summary: 'sources disagree on cause',
    metadata: {
      a: { source: 'a.example', url: 'https://a.example/1', frame: 'accident' },
      b: { source: 'b.example', url: 'https://b.example/1', frame: 'deliberate' },
    },
    evidence_ids: [],
  };
  return buildConfidenceReport({
    verification_status: 'developing',
    reliability_score: 55,
    reliability_label: 'UNCLEAR',
    source_count: 2,
    credible_source_count: 2,
    evidence: [
      ev({ url: 'https://a.example/1', domain: 'a.example', is_credible: true }),
      ev({ url: 'https://b.example/1', domain: 'b.example', is_credible: true }),
    ],
    contradictions: [contra],
    physical_evidence: null,
  });
}

describe('buildTrustExplanation', () => {
  it('produces a non-empty plain-language summary, why bullets, and a /trust learn-more link', () => {
    const exp = buildTrustExplanation({
      report: highReport(),
      source_count: 4,
      credible_source_count: 4,
      contradictions_count: 0,
    });
    assert.ok(exp.summary.length > 0, 'summary should be present');
    assert.ok(exp.why_bullets.length >= 1, 'at least one why-bullet');
    assert.ok(exp.learn_more.length >= 1, 'at least one learn-more link');
    assert.ok(
      exp.learn_more.some((l) => l.href === '/trust' || l.href.startsWith('/trust#')),
      'must link to /trust methodology',
    );
  });

  it('describes contested signals as disagreement and adds a watch-for line on cause conflicts', () => {
    const exp = buildTrustExplanation({
      report: contestedReport(),
      source_count: 2,
      credible_source_count: 2,
      contradictions_count: 1,
      contradiction_types: ['cause_conflict'],
    });
    assert.match(exp.summary, /different/i);
    assert.ok(exp.watch_for, 'watch_for should be set on contested signals');
    assert.match(String(exp.watch_for), /motive|disputed|cause/i);
    assert.ok(
      exp.learn_more.some((l) => l.href === '#source-disagreement'),
      'contested explanations must link to the source-disagreement section',
    );
  });

  it('NEVER contains any forbidden absolute-truth phrasing', () => {
    const cases = [
      buildTrustExplanation({
        report: highReport(),
        source_count: 4,
        credible_source_count: 4,
        contradictions_count: 0,
      }),
      buildTrustExplanation({
        report: contestedReport(),
        source_count: 2,
        credible_source_count: 2,
        contradictions_count: 1,
        contradiction_types: ['cause_conflict'],
      }),
      buildTrustExplanation({
        report: contestedReport(),
        source_count: 6,
        credible_source_count: 0,
        contradictions_count: 0,
        syndicated: true,
      }),
    ];
    for (const exp of cases) {
      const lines = [exp.summary, ...exp.why_bullets, exp.watch_for ?? ''];
      for (const line of lines) {
        for (const rx of FORBIDDEN_TRUST_PHRASES) {
          assert.ok(
            !rx.test(line),
            `Trust explanation contained forbidden phrase ${rx} in line: ${line}`,
          );
        }
      }
    }
  });

  it('isPlainTrustSafe rejects absolute-truth phrasing', () => {
    assert.equal(isPlainTrustSafe('This is true and AI verified.'), false);
    assert.equal(isPlainTrustSafe('This is false; debunked by experts.'), false);
    assert.equal(isPlainTrustSafe('Confirmed motive: state actor.'), false);
    assert.equal(
      isPlainTrustSafe('Multiple independent outlets are reporting this.'),
      true,
    );
  });

  it('mentions sensor coverage as coverage, not as a denial of the event', () => {
    const pe: PhysicalEvidence = {
      status: 'none_detected',
      confidence: 20,
      sources: [],
      limitations: ['Coverage only includes USGS-instrumented regions.'],
    };
    const exp = buildTrustExplanation({
      report: highReport(),
      source_count: 3,
      credible_source_count: 3,
      contradictions_count: 0,
      physical_evidence: pe,
    });
    const all = [exp.summary, ...exp.why_bullets, exp.watch_for ?? ''].join(' ');
    assert.ok(
      /not detected|coverage/i.test(all),
      'must describe sensor absence as coverage',
    );
    assert.ok(
      !/did not happen|never happened/i.test(all),
      'must NOT phrase sensor absence as denial of the event',
    );
  });
});
