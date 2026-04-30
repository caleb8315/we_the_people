import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeConflicts, summarizeConflicts } from '../conflict-analysis';
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

function detected(
  type: 'numeric_conflict' | 'presence_conflict' | 'cause_conflict',
  severity: 'low' | 'medium' | 'high' = 'medium',
): DetectedContradiction {
  return {
    type,
    severity,
    summary: 'Sources disagree.',
    metadata: {
      a: { source: 'a.example', url: 'https://a.example/1', value: 5 },
      b: { source: 'b.example', url: 'https://b.example/1', value: 50 },
      ratio: 10,
    },
    evidence_ids: [],
  };
}

describe('analyzeConflicts', () => {
  it('maps numeric_conflict / presence_conflict to direct_contradiction', () => {
    const out = analyzeConflicts({
      contradictions: [detected('numeric_conflict', 'high'), detected('presence_conflict', 'medium')],
      evidence: [],
    });
    const types = out.map((c) => c.type);
    assert.ok(types.includes('direct_contradiction'));
    const direct = out.find((c) => c.origin === 'detector_numeric')!;
    assert.equal(direct.type, 'direct_contradiction');
    assert.ok(direct.severity_score >= 70);
    assert.equal(direct.severity_band, 'high');
  });

  it('maps cause_conflict to framing_difference', () => {
    const out = analyzeConflicts({
      contradictions: [detected('cause_conflict', 'medium')],
      evidence: [],
    });
    const framing = out.find((c) => c.origin === 'detector_cause')!;
    assert.equal(framing.type, 'framing_difference');
  });

  it('detects insufficient_evidence when fewer than 3 sources', () => {
    const out = analyzeConflicts({
      contradictions: [],
      evidence: [],
    });
    const insufficient = out.find((c) => c.type === 'insufficient_evidence')!;
    assert.ok(insufficient);
    assert.equal(insufficient.severity_band, 'high');
  });

  it('detects timeline_mismatch when claim says "today" but sources span days', () => {
    const out = analyzeConflicts({
      contradictions: [],
      claim_text: 'Major event happening today.',
      evidence: [
        ev({ url: 'https://a.example/1', published_at: '2026-04-01T12:00:00Z' }),
        ev({ url: 'https://b.example/1', published_at: '2026-03-25T12:00:00Z' }),
      ],
    });
    const tl = out.find((c) => c.type === 'timeline_mismatch');
    assert.ok(tl, 'expected a timeline_mismatch');
  });

  it('detects missing_context when claim names entities/numbers no source mentions', () => {
    const out = analyzeConflicts({
      contradictions: [],
      claim_title: 'Senator Doe and Mayor Smith report 1,500 casualties in the Riverside district',
      evidence: [
        ev({ url: 'https://a.example/1', title: 'Local incident reported', excerpt: 'Authorities are investigating.' }),
        ev({ url: 'https://b.example/1', title: 'Investigation continues', excerpt: 'No further information.' }),
        ev({ url: 'https://c.example/1', title: 'Statement released', excerpt: 'A brief statement was issued.' }),
      ],
    });
    const mc = out.find((c) => c.type === 'missing_context');
    assert.ok(mc, 'expected a missing_context conflict');
  });

  it('orders results by severity (highest first)', () => {
    const out = analyzeConflicts({
      contradictions: [detected('numeric_conflict', 'high'), detected('cause_conflict', 'low')],
      evidence: [],
    });
    for (let i = 1; i < out.length; i += 1) {
      assert.ok(out[i - 1]!.severity_score >= out[i]!.severity_score);
    }
  });
});

describe('summarizeConflicts', () => {
  it('counts each conflict type and tracks the worst severity', () => {
    const out = analyzeConflicts({
      contradictions: [detected('numeric_conflict', 'high'), detected('cause_conflict', 'medium')],
      evidence: [],
    });
    const sum = summarizeConflicts(out);
    assert.equal(sum.total, out.length);
    assert.ok(sum.worst_severity >= 70);
    assert.ok(sum.by_type.direct_contradiction >= 1);
    assert.ok(sum.by_type.framing_difference >= 1);
  });

  it('flags only_insufficient when the only fired conflict is insufficient_evidence', () => {
    const out = analyzeConflicts({
      contradictions: [],
      evidence: [],
    });
    const sum = summarizeConflicts(out);
    assert.equal(sum.only_insufficient, true);
  });
});
