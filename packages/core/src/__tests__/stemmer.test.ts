import { describe, it, expect } from 'vitest';
import { porterStem } from '../stemmer';

describe('porterStem', () => {
  it('stems regular English words', () => {
    expect(porterStem('running')).toBe('run');
    expect(porterStem('killed')).toBe('kill');
    expect(porterStem('missiles')).toBe('missil');
    expect(porterStem('attacks')).toBe('attack');
    expect(porterStem('bombing')).toBe('bomb');
    expect(porterStem('launched')).toBe('launch');
  });

  it('handles -ed, -ing, -s suffixes', () => {
    expect(porterStem('reported')).toBe('report');
    expect(porterStem('reporting')).toBe('report');
    expect(porterStem('strikes')).toBe('strike');
    expect(porterStem('striking')).toBe('strike');
  });

  it('normalises casualty vocabulary', () => {
    expect(porterStem('wounded')).toBe('wound');
    expect(porterStem('casualties')).toBe('casualti');
    expect(porterStem('fatalities')).toBe('fatal');
  });

  it('returns short words unchanged', () => {
    expect(porterStem('us')).toBe('us');
    expect(porterStem('uk')).toBe('uk');
    expect(porterStem('an')).toBe('an');
  });

  it('stems complex suffixes', () => {
    expect(porterStem('internationally')).toBe('internation');
    expect(porterStem('negotiations')).toBe('negoti');
    expect(porterStem('humanitarian')).toBe('humanitarian');
  });

  it('handles words ending in -ize/-ise', () => {
    expect(porterStem('stabilize')).toBe('stabil');
    expect(porterStem('organize')).toBe('organ');
  });

  it('leaves proper nouns alone when short', () => {
    expect(porterStem('gaza')).toBe('gaza');
    expect(porterStem('iran')).toBe('iran');
  });
});
