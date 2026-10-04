import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvidenceCaseFile,
  classifyRebuttal,
  debunkCues,
  decideVerification,
  isCredibleDomain,
  isFactCheckSource,
  outletProfile,
} from '..';
import { buildEvidenceCards } from '../evidence-cards';
import { rankSources } from '../source-ranking';
import type { EvidenceItem } from '..';

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

const HOAX = 'Pope Francis endorses presidential candidate in surprise statement';

const DEBUNKS: EvidenceItem[] = [
  ev({
    url: 'https://www.reuters.com/fact-check/pope-endorsement-false-2026-01-02/',
    domain: 'reuters.com',
    title: 'Fact Check: Pope Francis did not endorse presidential candidate; statement is fabricated',
    is_credible: true,
  }),
  ev({
    url: 'https://apnews.com/article/pope-endorsement-hoax',
    domain: 'apnews.com',
    title: 'No, Pope Francis did not endorse a presidential candidate — the statement is a hoax',
    is_credible: true,
  }),
  ev({
    url: 'https://www.snopes.com/fact-check/pope-endorses-candidate/',
    domain: 'snopes.com',
    title: 'Did Pope Francis Endorse a Presidential Candidate?',
    excerpt: 'A website known for publishing fake news reported the endorsement.',
  }),
];

describe('debunk cues', () => {
  it('detects rebuttal wording that is absent from the claim', () => {
    assert.ok(debunkCues('Fact check: the video is fabricated', 'Video shows the event').length > 0);
  });

  it('ignores cue words that already appear in the claim itself', () => {
    assert.deepEqual(
      debunkCues('Police seized fake vaccine passports in Milan', 'Fake vaccine passports seized in Milan'),
      [],
    );
  });

  it('detects non-English rebuttals', () => {
    assert.ok(debunkCues('Это фейк: видео не из Киева', 'Video from Kyiv').length > 0);
    assert.ok(debunkCues('Es un bulo: la foto es de 2015', 'Foto del terremoto').length > 0);
    assert.ok(debunkCues('هذا الخبر كاذب', 'خبر عن الزلزال').length > 0);
  });

  it('classifies a fact-check without a rating snippet as context', () => {
    assert.equal(
      classifyRebuttal(
        { url: 'https://fullfact.org/online/claim-x/', domain: 'fullfact.org', title: 'Claim X', excerpt: null },
        'Claim X',
      ),
      'fact_check_context',
    );
  });
});

describe('rebuttals never count as corroboration', () => {
  it('decideVerification does not mark a debunked hoax corroborated', () => {
    const decision = decideVerification(HOAX, null, DEBUNKS);
    assert.notEqual(decision.status, 'verified');
    assert.ok(decision.decision_log.some((l) => l.startsWith('rebuttals_excluded')));
  });

  it('evidence cards mark debunks as disputes when claim text is provided', () => {
    const ranked = rankSources({ evidence: DEBUNKS, anchor_url: null });
    const cards = buildEvidenceCards({ evidence: DEBUNKS, ranked, contradictions: [], claim_text: HOAX });
    const reuters = cards.find((c) => c.domain === 'reuters.com');
    assert.equal(reuters?.stance, 'disputes');
  });

  it('case file contradicts the hoax instead of supporting it', () => {
    const ranked = rankSources({ evidence: DEBUNKS, anchor_url: null });
    const cards = buildEvidenceCards({ evidence: DEBUNKS, ranked, contradictions: [], claim_text: HOAX });
    const file = buildEvidenceCaseFile({
      title: HOAX,
      text: null,
      url: null,
      evidence: DEBUNKS,
      ranked_sources: ranked,
      evidence_cards: cards,
      contradictions: [],
      overall_band: 'medium',
    });
    const stances = file.claims.flatMap((c) => c.evidence.map((e) => e.stance));
    assert.ok(stances.includes('contradicts'));
    assert.ok(!stances.includes('directly_supports'));
    assert.notEqual(file.overall_verdict, 'supported');
  });
});

describe('outlet profiles', () => {
  it('labels state-controlled media and removes it from the credible list', () => {
    assert.equal(outletProfile('https://www.rt.com/news/123')?.ownership, 'state_controlled');
    assert.equal(outletProfile('trtworld.com')?.country, 'TR');
    assert.equal(isCredibleDomain('rt.com'), false);
    assert.equal(isCredibleDomain('trtworld.com'), false);
    assert.equal(isCredibleDomain('reuters.com'), true);
  });

  it('subdomains inherit the parent profile', () => {
    assert.equal(outletProfile('english.news.cn')?.name, 'Xinhua');
  });

  it('recognises fact-check sections of general outlets', () => {
    assert.equal(isFactCheckSource('https://www.reuters.com/fact-check/abc/', 'reuters.com'), true);
    assert.equal(isFactCheckSource('https://www.reuters.com/world/abc/', 'reuters.com'), false);
    assert.equal(isFactCheckSource(null, 'snopes.com'), true);
  });
});
