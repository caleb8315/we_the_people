import { describe, it, expect } from 'vitest';
import { extractEntities, entityTokens } from '../entities';

describe('extractEntities', () => {
  it('extracts country names', () => {
    const result = extractEntities('Iran launches missiles at Israel');
    expect(result.countries).toContain('IR');
    expect(result.countries).toContain('IL');
  });

  it('extracts demonyms', () => {
    const result = extractEntities('Iranian forces target Israeli positions');
    expect(result.countries).toContain('IR');
    expect(result.countries).toContain('IL');
  });

  it('extracts cities', () => {
    const result = extractEntities('Explosions reported in Gaza and Tel Aviv');
    expect(result.cities).toContain('gaza');
    expect(result.cities).toContain('tel_aviv');
  });

  it('extracts organisations', () => {
    const result = extractEntities('Hamas fires rockets from Gaza strip');
    expect(result.organisations).toContain('hamas');
    expect(result.regions).toContain('gaza_strip');
  });

  it('extracts leaders', () => {
    const result = extractEntities('Netanyahu orders military response after attack');
    expect(result.leaders).toContain('netanyahu');
  });

  it('extracts significant numbers', () => {
    const result = extractEntities('At least 45 killed in earthquake of magnitude 7.2');
    expect(result.numbers).toContain(45);
    expect(result.numbers).toContain(7.2);
  });

  it('extracts multi-word countries', () => {
    const result = extractEntities('United States sanctions North Korea over nuclear program');
    expect(result.countries).toContain('US');
    expect(result.countries).toContain('KP');
  });

  it('handles regions', () => {
    const result = extractEntities('Tensions rise in the Middle East after Red Sea attack');
    expect(result.regions).toContain('middle_east');
    expect(result.regions).toContain('red_sea');
  });

  it('handles Ukraine conflict vocabulary', () => {
    const result = extractEntities('Russia strikes Kyiv as Zelensky addresses NATO');
    expect(result.countries).toContain('RU');
    expect(result.countries).toContain('UA'); // city→country linkage: Kyiv → UA
    expect(result.cities).toContain('kyiv');
    expect(result.leaders).toContain('zelensky');
    expect(result.organisations).toContain('nato');
  });

  it('deduplicates country references', () => {
    const result = extractEntities('Israeli forces in Israel launch Israeli operation');
    // "Israel" and two "Israeli" should all resolve to IL but appear once
    expect(result.countries.filter(c => c === 'IL').length).toBe(1);
  });
});

describe('entityTokens', () => {
  it('creates prefixed tokens', () => {
    const entities = extractEntities('Iran strikes Gaza');
    const tokens = entityTokens(entities);
    expect(tokens.has('C:IR')).toBe(true);
    expect(tokens.has('CITY:gaza')).toBe(true);
  });

  it('uses log2 magnitude for numbers', () => {
    const entities = extractEntities('45 people killed');
    const tokens = entityTokens(entities);
    expect(tokens.has(`N:${Math.floor(Math.log2(45))}`)).toBe(true);
  });
});
