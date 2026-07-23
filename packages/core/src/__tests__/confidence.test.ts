import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandFromReliability,
  buildConfidenceReport,
  confidenceBandDisplay,
} from '../confidence';
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

function contradiction(
  type: 'numeric_conflict' | 'presence_conflict' | 'cause_conflict',
  aUrl = 'https://a.example/1',
  bUrl = 'https://b.example/1',
): DetectedContradiction {
  return {
    type,
    severity: 'medium',
    summary: 'sources disagree',
    metadata: {
      a: { source: 'a.example', url: aUrl, value: 5 },
      b: { source: 'b.example', url: bUrl, value: 50 },
    },
    evidence_ids: [],
  };
}

describe('bandFromReliability', () => {
  it('returns contested when any contradiction is present, overriding a HIGH label', () => {
    assert.equal(bandFromReliability('LIKELY_ACCURATE', 95, 1), 'contested');
  });

  it('maps reliability labels to bands deterministically', () => {
    assert.equal(bandFromReliability('LIKELY_ACCURATE', 80, 0), 'high');
    assert.equal(bandFromReliability('UNCLEAR', 50, 0), 'medium');
    assert.equal(bandFromReliability('LIKELY_UNRELIABLE', 10, 0), 'low');
  });

  it('falls back to numeric score when label is missing', () => {
    assert.equal(bandFromReliability(null, 90, 0), 'high');
    assert.equal(bandFromReliability(null, 55, 0), 'medium');
    assert.equal(bandFromReliability(null, 20, 0), 'low');
  });

  it('returns low when neither label nor score is available', () => {
    assert.equal(bandFromReliability(null, null, 0), 'low');
  });
});

describe('buildConfidenceReport', () => {
  it('produces a high-confidence report for well-corroborated signals with no disagreements', () => {
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: 80,
      reliability_label: 'LIKELY_ACCURATE',
      source_count: 4,
      credible_source_count: 3,
      evidence: [
        ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true }),
        ev({ url: 'https://apnews.com/b', domain: 'apnews.com', is_credible: true }),
        ev({ url: 'https://bbc.com/c', domain: 'bbc.com', is_credible: true }),
      ],
      contradictions: [],
      physical_evidence: null,
    });
    assert.equal(report.band, 'high');
    assert.equal(report.label_short, 'HIGH');
    assert.equal(report.label_display, 'Looks solid');
    assert.ok(report.explanation_bullets.length >= 1);
    assert.ok(report.explanation_bullets.length <= 3);
    assert.ok(report.source_trace.length >= 1);
    assert.ok(report.source_trace.length <= 5);
  });

  it('surfaces contested band and ranks conflicting sources first in source_trace', () => {
    const report = buildConfidenceReport({
      verification_status: 'developing',
      reliability_score: 60,
      reliability_label: 'UNCLEAR',
      source_count: 2,
      credible_source_count: 2,
      evidence: [
        ev({ url: 'https://a.example/1', domain: 'a.example', is_credible: true }),
        ev({ url: 'https://b.example/1', domain: 'b.example', is_credible: true }),
      ],
      contradictions: [contradiction('numeric_conflict', 'https://a.example/1', 'https://b.example/1')],
      physical_evidence: null,
    });
    assert.equal(report.band, 'contested');
    assert.equal(report.label_short, 'CONTESTED');
    assert.equal(report.source_trace[0]?.role, 'conflicting');
    const joined = report.explanation_bullets.join(' ').toLowerCase();
    assert.ok(joined.includes('disagree') || joined.includes('numbers'));
  });

  it('flags sensor sources when physical evidence is confirmed', () => {
    const pe: PhysicalEvidence = {
      status: 'confirmed',
      confidence: 85,
      sources: ['USGS seismic network', '3 credible outlets'],
      limitations: ['Public-source coverage only; classified data is not surveyed.'],
    };
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: 75,
      reliability_label: 'LIKELY_ACCURATE',
      source_count: 3,
      credible_source_count: 2,
      evidence: [
        ev({ url: 'https://reuters.com/a', domain: 'reuters.com', is_credible: true }),
        ev({ url: 'https://earthquake.usgs.gov/e', domain: 'earthquake.usgs.gov', source_id: 'usgs-quakes', is_credible: true }),
      ],
      contradictions: [],
      physical_evidence: pe,
    });
    assert.equal(report.band, 'high');
    const hasSensor = report.source_trace.some((e) => e.role === 'sensor');
    assert.equal(hasSensor, true);
    const mentionsUsgs = report.explanation_bullets.some((b) => /USGS|sensor/i.test(b));
    assert.equal(mentionsUsgs, true);
  });

  it('adds a complex_signal bullet when detection was skipped', () => {
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: 72,
      reliability_label: 'LIKELY_ACCURATE',
      source_count: 30,
      credible_source_count: 10,
      evidence: Array.from({ length: 3 }, (_, i) =>
        ev({ url: `https://credible${i}.example`, domain: `credible${i}.example`, is_credible: true }),
      ),
      contradictions: [],
      physical_evidence: null,
      complex_signal: true,
    });
    const complex = report.explanation_bullets.some((b) =>
      /automatically spot disagreements|review the sources yourself/i.test(b),
    );
    assert.equal(complex, true);
  });

  it('never emits more than 3 bullets or more than 5 sources', () => {
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: 80,
      reliability_label: 'LIKELY_ACCURATE',
      source_count: 10,
      credible_source_count: 7,
      evidence: Array.from({ length: 10 }, (_, i) =>
        ev({ url: `https://c${i}.example`, domain: `c${i}.example`, is_credible: true }),
      ),
      contradictions: [contradiction('cause_conflict')],
      physical_evidence: {
        status: 'confirmed',
        confidence: 85,
        sources: ['USGS seismic network'],
        limitations: ['x'],
      },
      complex_signal: true,
    });
    assert.ok(report.explanation_bullets.length <= 3);
    assert.ok(report.source_trace.length <= 5);
  });

  it('applies a corroboration floor so CORROBORATED signals never show "Limited evidence"', () => {
    // The reliability scorer hasn't produced a label yet (null/null), but the
    // signal is CORROBORATED with 6 independent credible outlets. Without the
    // corroboration floor, bandFromReliability would return `low` and the
    // card would incoherently say "Limited evidence" next to 6 sources.
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: null,
      reliability_label: null,
      source_count: 6,
      credible_source_count: 6,
      evidence: Array.from({ length: 6 }, (_, i) =>
        ev({ url: `https://credible${i}.example`, domain: `credible${i}.example`, is_credible: true }),
      ),
      contradictions: [],
      physical_evidence: null,
    });
    assert.equal(report.band, 'high');
    assert.match(report.summary, /6 independent rated outlets/);
    assert.doesNotMatch(report.summary, /Limited evidence|enough independent reporting/i);
  });

  it('floors band to `medium` when 2-3 rated outlets are present and no label exists', () => {
    const report = buildConfidenceReport({
      verification_status: 'developing',
      reliability_score: null,
      reliability_label: null,
      source_count: 3,
      credible_source_count: 2,
      evidence: [
        ev({ url: 'https://a.example', domain: 'a.example', is_credible: true }),
        ev({ url: 'https://b.example', domain: 'b.example', is_credible: true }),
      ],
      contradictions: [],
      physical_evidence: null,
    });
    assert.equal(report.band, 'medium');
    assert.match(report.summary, /2 rated/);
  });

  it('floors band to `medium` on volume alone when 5+ unrated sources agree (bias guard)', () => {
    // Scenario: the reliability scorer returns LIKELY_UNRELIABLE because
    // none of the sources are on our curated credibility list, but 9
    // independent domains are all reporting the same thing with no
    // detected disagreement. Treating this as "Limited evidence" because
    // the sources aren't mainstream IS editorial bias — independent /
    // regional reporting is still reporting. The volume floor must lift
    // this to at least `medium`.
    const report = buildConfidenceReport({
      verification_status: 'developing',
      reliability_score: null,
      reliability_label: null,
      source_count: 9,
      credible_source_count: 0,
      evidence: Array.from({ length: 9 }, (_, i) =>
        ev({ url: `https://indie${i}.example`, domain: `indie${i}.example`, is_credible: false }),
      ),
      contradictions: [],
      physical_evidence: null,
    });
    assert.equal(report.band, 'medium');
    // Language must NOT disparage non-credible sources.
    assert.doesNotMatch(
      report.summary,
      /blogs|aggregators|unknown outlets|not established newsrooms/i,
    );
    assert.match(report.summary, /9 independent sources/);
  });

  it('still routes to contested when contradictions exist, regardless of credible count', () => {
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: null,
      reliability_label: null,
      source_count: 6,
      credible_source_count: 6,
      evidence: Array.from({ length: 6 }, (_, i) =>
        ev({ url: `https://c${i}.example`, domain: `c${i}.example`, is_credible: true }),
      ),
      contradictions: [contradiction('numeric_conflict')],
      physical_evidence: null,
    });
    assert.equal(report.band, 'contested');
  });

  it('surfaces neutral low-confidence language when only one source is found', () => {
    const report = buildConfidenceReport({
      verification_status: 'unverified',
      reliability_score: 15,
      reliability_label: 'LIKELY_UNRELIABLE',
      source_count: 1,
      credible_source_count: 0,
      evidence: [ev({ url: 'https://blog.example', domain: 'blog.example', is_credible: false })],
      contradictions: [],
      physical_evidence: null,
    });
    assert.equal(report.band, 'low');
    // Copy must be neutral — no "blogs / aggregators / not established
    // newsrooms" framing. That language is itself a form of editorial bias.
    const bullets = report.explanation_bullets.join(' ');
    assert.doesNotMatch(
      bullets,
      /blogs, aggregators, or unknown outlets|not established newsrooms/i,
    );
    assert.doesNotMatch(
      report.summary,
      /blogs, aggregators, or unknown outlets|not established newsrooms/i,
    );
    const mentionsOneSource = report.explanation_bullets.some((b) =>
      /only one source|one source is reporting/i.test(b),
    );
    assert.equal(mentionsOneSource, true);
  });
});

describe('confidenceBandDisplay', () => {
  it('maps bands to people-first display strings', () => {
    assert.equal(confidenceBandDisplay('high'), 'Looks solid');
    assert.equal(confidenceBandDisplay('medium'), 'Still forming');
    assert.equal(confidenceBandDisplay('low'), 'Thin so far');
    assert.equal(confidenceBandDisplay('contested'), 'Sources clash');
  });
});
