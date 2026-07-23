import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectBias, detectCorpusBias, BIAS_DISCLAIMER } from '../bias';

describe('detectBias', () => {
  it('returns a neutral report on short / empty input', () => {
    const r = detectBias('');
    assert.equal(r.band, 'neutral');
    assert.equal(r.overall_intensity, 0);
    assert.equal(r.signals.length, 4);
  });

  it('flags loaded vocabulary without claiming the underlying claim is false', () => {
    const r = detectBias(
      'The regime sent thugs and extremists to crush the freedom-fighters in a shocking show of force.',
    );
    const loaded = r.signals.find((s) => s.type === 'loaded_language')!;
    assert.ok(loaded.intensity > 0);
    assert.ok(loaded.examples.length > 0);
    assert.ok(!/(false|untrue|not true)/i.test(r.summary));
    assert.equal(r.disclaimer, BIAS_DISCLAIMER);
  });

  it('flags one-sided framing when only critics are quoted, not supporters', () => {
    const r = detectBias(
      'Critics say the policy is dangerous. Many experts warn against it. The plan moves forward anyway.',
    );
    const oneSided = r.signals.find((s) => s.type === 'one_sided_framing')!;
    assert.ok(oneSided.intensity > 0);
  });

  it('does NOT flag one-sided framing when both sides are quoted', () => {
    const r = detectBias(
      'Critics say the policy is dangerous. Supporters argue it is necessary. Both sides will testify.',
    );
    const oneSided = r.signals.find((s) => s.type === 'one_sided_framing')!;
    assert.equal(oneSided.intensity, 0);
  });

  it('flags omission cues like "did not respond" or "could not be reached"', () => {
    const r = detectBias(
      'The Senator did not respond to requests for comment. The agency declined to comment. The accusation remains unsubstantiated.',
    );
    const omission = r.signals.find((s) => s.type === 'selective_omission')!;
    assert.ok(omission.intensity > 0);
  });

  it('flags emotional tone like "shocking" / "must-read" / ALL CAPS shouting', () => {
    const r = detectBias(
      'SHOCKING! TERRIFYING! You wont believe this incredible must-see expose! Officials were FURIOUS!',
    );
    const emotion = r.signals.find((s) => s.type === 'emotional_tone')!;
    assert.ok(emotion.intensity > 0);
  });

  it('always carries a plain-language bias disclaimer', () => {
    const r = detectBias('Some loaded regime extremist propaganda terrorists committed crushing attacks here.');
    assert.match(r.disclaimer, /bias|framing|loaded|how the text is written/i);
    // Bias summary describes writing, not whether the claim is true/false.
    assert.ok(!/this is (true|false)/i.test(r.summary));
  });
});

describe('detectCorpusBias', () => {
  it('aggregates per-text reports into a corpus-level rating', () => {
    const r = detectCorpusBias([
      'Critics say the regime committed shocking atrocities.',
      'The investigation continues; details remain limited.',
      'TERRIFYING new revelations have emerged about the corrupt scandal.',
    ]);
    assert.ok(r.pieces > 0);
    assert.ok(r.avg_intensity >= 0);
    assert.equal(typeof r.has_signal, 'boolean');
    assert.match(r.disclaimer, /bias|framing|loaded|how the text is written/i);
  });

  it('returns a neutral report on empty corpora', () => {
    const r = detectCorpusBias([]);
    assert.equal(r.has_signal, false);
    assert.equal(r.band, 'neutral');
  });
});
