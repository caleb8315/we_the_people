import { describe, it, expect } from 'vitest';
import { clusterItems, extractRichTerms, weightedJaccard, titleSimilarity } from '../cluster';

describe('extractRichTerms', () => {
  it('produces stemmed and synonym-expanded words', () => {
    const rt = extractRichTerms('Iran launches missiles at Israel');
    expect(rt.words.has('iran')).toBe(true);
    expect(rt.words.has('launch')).toBe(true);
    // "missiles" → stemmed "missil" → synonym map "missile"
    expect(rt.words.has('missile')).toBe(true);
  });

  it('extracts entity tokens', () => {
    const rt = extractRichTerms('Iran launches missiles at Israel');
    expect(rt.entities.has('C:IR')).toBe(true);
    expect(rt.entities.has('C:IL')).toBe(true);
  });

  it('generates bigrams', () => {
    const rt = extractRichTerms('Iran launches missiles');
    expect(rt.bigrams.size).toBeGreaterThan(0);
  });

  it('links cities to countries', () => {
    const rt = extractRichTerms('Tehran fires rockets');
    expect(rt.entities.has('C:IR')).toBe(true);
    expect(rt.entities.has('CITY:tehran')).toBe(true);
  });
});

describe('weightedJaccard', () => {
  it('returns 1.0 for identical terms', () => {
    const a = extractRichTerms('Iran launches missiles at Israel');
    expect(weightedJaccard(a, a)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for completely different headlines', () => {
    const a = extractRichTerms('Apple releases new iPhone');
    const b = extractRichTerms('Earthquake hits Turkey magnitude 7');
    expect(weightedJaccard(a, b)).toBeLessThan(0.05);
  });

  it('scores similar headlines highly via entity + synonym matching', () => {
    const a = extractRichTerms('Iran launches missiles at Israel');
    const b = extractRichTerms('Tehran fires rockets targeting Israeli cities');
    const sim = weightedJaccard(a, b);
    // Both share C:IR, C:IL entities + "missile" synonym → high score
    expect(sim).toBeGreaterThan(0.25);
  });
});

describe('titleSimilarity', () => {
  it('matches headlines about the same earthquake differently worded', () => {
    const sim = titleSimilarity(
      'Magnitude 7.2 earthquake hits Turkey, at least 45 killed',
      'Major quake strikes Turkey killing dozens',
    );
    // Shared: Turkey (C:TR), "earthquake"→synonym, "killed"→synonym
    expect(sim).toBeGreaterThan(0.15);
  });

  it('matches conflict headlines from different outlets', () => {
    const sim = titleSimilarity(
      'Russia launches drone strikes on Kyiv overnight',
      'Ukraine capital hit by Russian drone attacks',
    );
    // Shared: C:RU, C:UA, "drone"
    expect(sim).toBeGreaterThan(0.2);
  });

  it('matches hurricane headlines with synonym coverage', () => {
    const sim = titleSimilarity(
      'Hurricane batters Florida coast with deadly winds',
      'Tropical storm causes devastation across Florida',
    );
    // Shared: "florida" (US state entity), "hurricane"↔"tropical storm" synonym
    expect(sim).toBeGreaterThan(0.15);
  });

  it('does not match unrelated headlines', () => {
    const sim = titleSimilarity(
      'Bitcoin surges past $100,000 on ETF approval',
      'Earthquake kills dozens in Indonesia',
    );
    expect(sim).toBeLessThan(0.05);
  });

  it('matches ceasefire headlines despite wording differences', () => {
    const sim = titleSimilarity(
      'Israel and Hamas agree to ceasefire deal',
      'Truce reached between Israeli forces and Hamas militants',
    );
    // Shared: C:IL, ORG:hamas, "ceasefire"↔"truce" synonym
    expect(sim).toBeGreaterThan(0.3);
  });

  it('matches cyber attack headlines', () => {
    const sim = titleSimilarity(
      'Major ransomware attack hits US hospitals',
      'American healthcare systems breached in cyber attack',
    );
    // Shared: C:US, "attack", "ransomware"↔"cyberattack" in words
    expect(sim).toBeGreaterThan(0.15);
  });

  it('strongly matches multiple outlets on the same story', () => {
    const sim = titleSimilarity(
      'Ukraine shoots down Russian drones over Kyiv',
      'Russian drone attack on Kyiv thwarted by Ukrainian defenses',
    );
    // Shared: C:RU, C:UA, CITY:kyiv, "drone", "russian"
    expect(sim).toBeGreaterThan(0.4);
  });
});

describe('clusterItems', () => {
  it('clusters identical headlines', () => {
    const ids = clusterItems([
      { title: 'Iran strikes Israel', topic: 'war', published_day: '2024-04-14' },
      { title: 'Iran strikes Israel', topic: 'war', published_day: '2024-04-14' },
    ]);
    expect(ids[0]).toBe(ids[1]);
  });

  it('clusters similar headlines from same topic + day', () => {
    const ids = clusterItems([
      { title: 'Iran launches missiles at Israel', topic: 'war', published_day: '2024-04-14' },
      { title: 'Tehran fires rockets toward Israeli cities', topic: 'war', published_day: '2024-04-14' },
    ]);
    expect(ids[0]).toBe(ids[1]);
  });

  it('clusters across adjacent days', () => {
    const ids = clusterItems([
      { title: 'Earthquake kills dozens in Turkey', topic: 'disaster', published_day: '2024-04-14' },
      { title: 'Turkey earthquake death toll rises', topic: 'disaster', published_day: '2024-04-15' },
    ]);
    expect(ids[0]).toBe(ids[1]);
  });

  it('clusters across topic affinity groups (war ↔ civil)', () => {
    const ids = clusterItems([
      { title: 'Protests erupt in Gaza over Israeli airstrikes', topic: 'civil', published_day: '2024-04-14' },
      { title: 'Israeli airstrikes trigger unrest in Gaza', topic: 'war', published_day: '2024-04-14' },
    ]);
    expect(ids[0]).toBe(ids[1]);
  });

  it('does not cluster unrelated headlines', () => {
    const ids = clusterItems([
      { title: 'Bitcoin hits all-time high', topic: 'economy', published_day: '2024-04-14' },
      { title: 'Earthquake hits Turkey', topic: 'disaster', published_day: '2024-04-14' },
    ]);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('handles empty input', () => {
    expect(clusterItems([])).toEqual([]);
  });

  it('clusters multiple outlets on the same story', () => {
    const ids = clusterItems([
      { title: 'Ukraine shoots down Russian drones over Kyiv', topic: 'war', published_day: '2024-06-01' },
      { title: 'Russian drone attack on Kyiv thwarted by Ukrainian defenses', topic: 'war', published_day: '2024-06-01' },
      { title: 'Kyiv under drone assault from Russia overnight', topic: 'war', published_day: '2024-06-01' },
    ]);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[1]).toBe(ids[2]);
  });
});
