import { describe, it, expect } from 'vitest';
import { canonicalSynonym, expandSynonyms } from '../synonyms';

describe('canonicalSynonym', () => {
  it('maps synonymous weapons terms', () => {
    expect(canonicalSynonym('rocket')).toBe('missile');
    expect(canonicalSynonym('rockets')).toBe('missile');
    expect(canonicalSynonym('missile')).toBe('missile');
  });

  it('maps casualty synonyms', () => {
    expect(canonicalSynonym('dead')).toBe('killed');
    expect(canonicalSynonym('slain')).toBe('killed');
    expect(canonicalSynonym('fatalities')).toBe('killed');
    expect(canonicalSynonym('died')).toBe('killed');
  });

  it('maps disaster synonyms', () => {
    expect(canonicalSynonym('quake')).toBe('earthquake');
    expect(canonicalSynonym('temblor')).toBe('earthquake');
    expect(canonicalSynonym('typhoon')).toBe('hurricane');
    expect(canonicalSynonym('cyclone')).toBe('hurricane');
  });

  it('maps conflict action synonyms', () => {
    expect(canonicalSynonym('truce')).toBe('ceasefire');
    expect(canonicalSynonym('armistice')).toBe('ceasefire');
    expect(canonicalSynonym('assault')).toBe('attack');
    expect(canonicalSynonym('offensive')).toBe('attack');
  });

  it('maps economic synonyms', () => {
    expect(canonicalSynonym('embargo')).toBe('sanction');
    expect(canonicalSynonym('tariffs')).toBe('tariff');
    expect(canonicalSynonym('downturn')).toBe('recession');
  });

  it('maps cyber synonyms', () => {
    expect(canonicalSynonym('hacked')).toBe('cyberattack');
    expect(canonicalSynonym('breach')).toBe('cyberattack');
    expect(canonicalSynonym('ransomware')).toBe('ransomware');
  });

  it('returns unknown words unchanged', () => {
    expect(canonicalSynonym('parliament')).toBe('parliament');
    expect(canonicalSynonym('xyz123')).toBe('xyz123');
  });
});

describe('expandSynonyms', () => {
  it('normalises a set of terms to canonical forms', () => {
    const input = new Set(['rockets', 'dead', 'gaza', 'typhoon']);
    const result = expandSynonyms(input);
    expect(result.has('missile')).toBe(true);
    expect(result.has('killed')).toBe(true);
    expect(result.has('gaza')).toBe(true);
    expect(result.has('hurricane')).toBe(true);
    expect(result.has('rockets')).toBe(false);
    expect(result.has('dead')).toBe(false);
  });
});
