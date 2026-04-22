/**
 * Phase 5 — Quality benchmark set.
 *
 * A small, hand-curated table of "known outcomes" scenarios the
 * confidence engine must get right. Every scenario locks one of the
 * build plan's non-negotiable rules:
 *
 *   1. Multiple credible independent outlets → HIGH.
 *   2. Any detected contradiction → CONTESTED regardless of score.
 *   3. Single credible outlet → at most MEDIUM.
 *   4. Social-only submission → cap at MEDIUM even with high score.
 *   5. Non-credible-only → LOW.
 *   6. Sensor corroboration → stays MEDIUM at minimum.
 *
 * When this file fails in CI, we have a regression in the confidence
 * contract — NOT a test bug. Fix the engine before relaxing a case.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfidenceReport } from '../confidence';
import type { EvidenceItem } from '../types';
import type { DetectedContradiction } from '../contradictions';

function ev(url: string, credible: boolean, source_id: string | null = null): EvidenceItem {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return {
    source_id,
    url,
    domain: host,
    title: null,
    published_at: null,
    is_credible: credible,
    excerpt: null,
  };
}

describe('quality benchmarks — confidence engine', () => {
  it('Scenario 1: multiple credible independent outlets → HIGH', () => {
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: 82,
      reliability_label: 'LIKELY_ACCURATE',
      evidence: [
        ev('https://www.reuters.com/a', true),
        ev('https://apnews.com/b', true),
        ev('https://www.bbc.com/c', true),
      ],
      contradictions: [],
      physical_evidence: null,
      source_count: 3,
      credible_source_count: 3,
    });
    assert.equal(report.band, 'high');
  });

  it('Scenario 2: any contradiction → CONTESTED regardless of score', () => {
    const evidence = [
      ev('https://www.reuters.com/a', true),
      ev('https://apnews.com/b', true),
    ];
    const contradictions: DetectedContradiction[] = [
      {
        id: 'c1',
        signal_id: 'sig',
        type: 'numeric_conflict',
        severity: 'high',
        description: 'Casualty count disagreement',
        evidence_ids: ['idx:0', 'idx:1'],
        metadata: { a: { url: evidence[0]!.url }, b: { url: evidence[1]!.url } },
        created_at: new Date().toISOString(),
      } as unknown as DetectedContradiction,
    ];
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: 85,
      reliability_label: 'LIKELY_ACCURATE',
      evidence,
      contradictions,
      physical_evidence: null,
      source_count: 2,
      credible_source_count: 2,
    });
    assert.equal(report.band, 'contested');
  });

  it('Scenario 3: single credible outlet → MEDIUM at most', () => {
    const report = buildConfidenceReport({
      verification_status: 'developing',
      reliability_score: 55,
      reliability_label: 'UNCLEAR',
      evidence: [ev('https://www.reuters.com/a', true)],
      contradictions: [],
      physical_evidence: null,
      source_count: 1,
      credible_source_count: 1,
    });
    assert.notEqual(report.band, 'high');
  });

  it('Scenario 4: social-only submission → cap at MEDIUM even with high score', () => {
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: 90,
      reliability_label: 'LIKELY_ACCURATE',
      evidence: [ev('https://x.com/u/status/1', false)],
      contradictions: [],
      physical_evidence: null,
      source_count: 1,
      credible_source_count: 0,
      cap_band_at_medium: true,
      provenance_warnings: ['Social submission — awaiting corroboration.'],
    });
    assert.equal(report.band, 'medium');
  });

  it('Scenario 5: non-credible-only → LOW', () => {
    const report = buildConfidenceReport({
      verification_status: 'developing',
      reliability_score: 25,
      reliability_label: 'LIKELY_UNRELIABLE',
      evidence: [
        ev('https://somerandomblog.example/a', false),
        ev('https://another-blog.example/b', false),
      ],
      contradictions: [],
      physical_evidence: null,
      source_count: 2,
      credible_source_count: 0,
    });
    assert.equal(report.band, 'low');
  });

  it('Scenario 6: sensor corroboration present → does not downgrade HIGH', () => {
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: 78,
      reliability_label: 'LIKELY_ACCURATE',
      evidence: [
        ev('https://www.reuters.com/a', true),
        ev('https://apnews.com/b', true),
        ev('https://earthquake.usgs.gov/earthquakes/eventpage/xyz', true, 'usgs-quakes'),
      ],
      contradictions: [],
      physical_evidence: {
        status: 'confirmed',
        score: 85,
        sources: ['USGS earthquake catalog', 'credible outlets'],
        indicators: ['sensor_confirmation'],
        details: {},
      } as unknown as Parameters<typeof buildConfidenceReport>[0]['physical_evidence'],
      source_count: 3,
      credible_source_count: 3,
    });
    assert.equal(report.band, 'high');
    assert.ok(
      report.explanation_bullets.some((b) => /sensor/i.test(b)),
      'Expected a sensor-corroboration bullet',
    );
  });

  it('Scenario 7: zero evidence → LOW with at least one bullet', () => {
    const report = buildConfidenceReport({
      verification_status: 'unverified',
      reliability_score: null,
      reliability_label: null,
      evidence: [],
      contradictions: [],
      physical_evidence: null,
      source_count: 0,
      credible_source_count: 0,
    });
    assert.equal(report.band, 'low');
    assert.ok(report.explanation_bullets.length >= 1);
  });

  it('Scenario 8: every report must have a non-empty summary + display label', () => {
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: 60,
      reliability_label: 'UNCLEAR',
      evidence: [ev('https://www.reuters.com/a', true)],
      contradictions: [],
      physical_evidence: null,
      source_count: 1,
      credible_source_count: 1,
    });
    assert.ok(report.summary.length > 0);
    assert.ok(report.label_display.length > 0);
    assert.ok(report.label_short.length > 0);
  });
});
