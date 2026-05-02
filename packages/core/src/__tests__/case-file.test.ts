import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvidenceCaseFile,
  claimEvidenceStanceLabel,
  decomposeClaims,
  verdictLabel,
} from '..';
import { buildEvidenceCards } from '../evidence-cards';
import { rankSources } from '../source-ranking';
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

describe('decomposeClaims', () => {
  it('splits mixed submissions into typed atomic claims', () => {
    const claims = decomposeClaims({
      text:
        'NASA confirmed a meteor over Berlin in 2024 and officials said it caused a sonic boom. A viral post claims the video is AI-generated.',
      kind: 'text',
    });
    assert.ok(claims.length >= 2);
    assert.ok(claims.some((c) => c.kind === 'quote' || c.kind === 'causal'));
    assert.ok(claims.some((c) => c.kind === 'image'));
    assert.ok(claims.every((c) => c.normalized_text.length > 0));
  });

  it('marks broad conspiracy wording as lower checkability', () => {
    const [claim] = decomposeClaims({
      text: 'They are hiding the truth and everyone knows it is a secret coverup.',
      kind: 'text',
    });
    assert.ok(claim);
    assert.equal(claim.kind, 'conspiracy');
    assert.equal(claim.checkability, 'low');
  });
});

describe('buildEvidenceCaseFile', () => {
  it('builds claim-level verdicts, uncertainty, and evidence mapping', () => {
    const evidence = [
      ev({
        url: 'https://nasa.gov/meteor-berlin',
        domain: 'nasa.gov',
        title: 'NASA confirms meteor observed over Berlin in 2024',
        excerpt: 'NASA confirms meteor observed over Berlin in 2024 after bright fireball reports.',
        is_credible: true,
      }),
      ev({
        url: 'https://reuters.com/world/europe/meteor-berlin',
        domain: 'reuters.com',
        title: 'Meteor over Berlin confirmed by officials',
        excerpt: 'Officials confirmed a meteor over Berlin in 2024, matching public video reports.',
        is_credible: true,
      }),
      ev({
        url: 'https://en.wikipedia.org/wiki/Meteor',
        domain: 'en.wikipedia.org',
        title: 'Meteor',
        excerpt: 'Meteors are visible passages of meteoroids through the atmosphere.',
      }),
    ];
    const ranked = rankSources({ evidence });
    const cards = buildEvidenceCards({ evidence, ranked, contradictions: [] });
    const caseFile = buildEvidenceCaseFile({
      title: 'NASA confirmed a meteor over Berlin in 2024.',
      text: 'A viral post claims the video is AI-generated.',
      url: 'https://example.com/post',
      evidence,
      ranked_sources: ranked,
      evidence_cards: cards,
      contradictions: [],
      overall_band: 'medium',
    });

    assert.ok(caseFile.claims.length >= 2);
    assert.ok(caseFile.what_remains_uncertain.length > 0);
    assert.ok(caseFile.what_would_make_this_stronger.length > 0);
    assert.ok(caseFile.claims.some((c) => c.support_count > 0));
    assert.match(verdictLabel(caseFile.overall_verdict), /Supported|Unresolved|evidence|Context/i);
    assert.equal(claimEvidenceStanceLabel('mentions_without_evidence'), 'Mentions only');
  });
});
