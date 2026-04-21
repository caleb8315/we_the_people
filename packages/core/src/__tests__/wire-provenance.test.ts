import { describe, it, expect } from 'vitest';
import { tagWireProvenance, countIndependentSources } from '../wire-provenance';
import type { EvidenceItem } from '../types';

function makeEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    source_id: 'test',
    url: 'https://example.com/article',
    domain: 'example.com',
    title: 'Test article',
    published_at: '2024-01-01T12:00:00Z',
    is_credible: true,
    excerpt: 'Some excerpt text',
    ...overrides,
  };
}

describe('tagWireProvenance', () => {
  it('detects wire source by domain', () => {
    const evidence = [
      makeEvidence({ domain: 'reuters.com', source_id: 'reuters-world' }),
    ];
    const tagged = tagWireProvenance(evidence);
    expect(tagged[0]!.wire_source).toBe('reuters');
    expect(tagged[0]!.is_independent).toBe(true); // wire originator IS independent
  });

  it('detects wire attribution in text', () => {
    const evidence = [
      makeEvidence({
        domain: 'cnn.com',
        title: 'Breaking news (Reuters)',
        excerpt: 'CNN reports that...',
      }),
    ];
    const tagged = tagWireProvenance(evidence);
    expect(tagged[0]!.wire_source).toBe('reuters');
    expect(tagged[0]!.is_independent).toBe(false);
  });

  it('detects AP attribution', () => {
    const evidence = [
      makeEvidence({
        domain: 'nytimes.com',
        title: 'Story headline',
        excerpt: 'By Associated Press — details of the story...',
      }),
    ];
    const tagged = tagWireProvenance(evidence);
    expect(tagged[0]!.wire_source).toBe('ap');
    expect(tagged[0]!.is_independent).toBe(false);
  });

  it('marks original reporting as independent', () => {
    const evidence = [
      makeEvidence({ domain: 'bbc.co.uk', title: 'BBC exclusive investigation' }),
    ];
    const tagged = tagWireProvenance(evidence);
    expect(tagged[0]!.wire_source).toBeNull();
    expect(tagged[0]!.is_independent).toBe(true);
  });

  it('detects n-gram containment from wire copy', () => {
    const wireText = 'The United Nations Security Council met on Tuesday to discuss the escalating situation in the Middle East region following recent military operations and civilian casualties reported by health officials';
    const evidence = [
      makeEvidence({
        domain: 'reuters.com',
        source_id: 'reuters-world',
        title: 'UN Security Council meets on Middle East',
        excerpt: wireText,
      }),
      makeEvidence({
        domain: 'example-news.com',
        title: 'UN Security Council meets on Middle East',
        excerpt: wireText,
      }),
    ];
    const tagged = tagWireProvenance(evidence);
    expect(tagged[0]!.is_independent).toBe(true); // reuters is original
    expect(tagged[1]!.wire_source).toBe('reuters');
    expect(tagged[1]!.is_independent).toBe(false); // copy detected
  });
});

describe('countIndependentSources', () => {
  it('counts correctly with mixed wire and original', () => {
    const evidence = [
      makeEvidence({ domain: 'reuters.com', source_id: 'reuters-world' }),
      makeEvidence({ domain: 'bbc.co.uk', source_id: 'bbc-world', title: 'Original BBC reporting' }),
      makeEvidence({ domain: 'cnn.com', source_id: 'cnn-world', title: 'Breaking (Reuters)' }),
    ];
    const tagged = tagWireProvenance(evidence);
    const counts = countIndependentSources(tagged);
    expect(counts.total).toBe(3);
    expect(counts.independent).toBe(2); // reuters + bbc, not CNN (wire copy)
    expect(counts.wire_groups['reuters']).toBeGreaterThanOrEqual(1);
  });
});
