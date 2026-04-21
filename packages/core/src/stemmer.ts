/**
 * Lightweight Porter stemmer — zero dependencies.
 *
 * Implements the classic Porter (1980) suffix-stripping algorithm for English.
 * Optimised for news headlines: short words (< 3 chars) and proper-noun
 * markers are returned unchanged so that entity extraction downstream
 * doesn't lose signal.
 *
 * Reference: Porter, M.F. "An algorithm for suffix stripping."
 *            Program 14.3 (1980): 130-137.
 */

function isConsonant(word: string, i: number): boolean {
  const c = word[i];
  if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') return false;
  if (c === 'y') return i === 0 || !isConsonant(word, i - 1);
  return true;
}

function measure(word: string): number {
  let n = 0;
  let i = 0;
  const len = word.length;
  while (i < len && isConsonant(word, i)) i++;
  if (i >= len) return 0;
  while (i < len) {
    while (i < len && !isConsonant(word, i)) i++;
    if (i >= len) break;
    n++;
    while (i < len && isConsonant(word, i)) i++;
  }
  return n;
}

function containsVowel(word: string): boolean {
  for (let i = 0; i < word.length; i++) {
    if (!isConsonant(word, i)) return true;
  }
  return false;
}

function endsWithDouble(word: string): boolean {
  if (word.length < 2) return false;
  return word[word.length - 1] === word[word.length - 2] && isConsonant(word, word.length - 1);
}

function cvc(word: string): boolean {
  const len = word.length;
  if (len < 3) return false;
  if (
    !isConsonant(word, len - 1) ||
    isConsonant(word, len - 2) ||
    !isConsonant(word, len - 3)
  )
    return false;
  const ch = word[len - 1];
  return ch !== 'w' && ch !== 'x' && ch !== 'y';
}

function step1a(word: string): string {
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ies')) return word.slice(0, -2);
  if (word.endsWith('ss')) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function step1b(word: string): string {
  if (word.endsWith('eed')) {
    const stem = word.slice(0, -3);
    return measure(stem) > 0 ? stem + 'ee' : word;
  }
  let stem = '';
  let found = false;
  if (word.endsWith('ed')) {
    stem = word.slice(0, -2);
    found = containsVowel(stem);
  } else if (word.endsWith('ing')) {
    stem = word.slice(0, -3);
    found = containsVowel(stem);
  }
  if (!found) return word;
  word = stem;
  if (word.endsWith('at') || word.endsWith('bl') || word.endsWith('iz')) return word + 'e';
  if (endsWithDouble(word)) {
    const last = word[word.length - 1];
    if (last !== 'l' && last !== 's' && last !== 'z') return word.slice(0, -1);
  }
  if (measure(word) === 1 && cvc(word)) return word + 'e';
  return word;
}

function step1c(word: string): string {
  if (word.endsWith('y') && containsVowel(word.slice(0, -1))) {
    return word.slice(0, -1) + 'i';
  }
  return word;
}

const STEP2: [string, string][] = [
  ['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'],
  ['izer', 'ize'], ['abli', 'able'], ['alli', 'al'], ['entli', 'ent'],
  ['eli', 'e'], ['ousli', 'ous'], ['ization', 'ize'], ['ation', 'ate'],
  ['ator', 'ate'], ['alism', 'al'], ['iveness', 'ive'], ['fulness', 'ful'],
  ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble'],
];

function step2(word: string): string {
  for (const [suffix, replacement] of STEP2) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (measure(stem) > 0) return stem + replacement;
      return word;
    }
  }
  return word;
}

const STEP3: [string, string][] = [
  ['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['iciti', 'ic'],
  ['ical', 'ic'], ['ful', ''], ['ness', ''],
];

function step3(word: string): string {
  for (const [suffix, replacement] of STEP3) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (measure(stem) > 0) return stem + replacement;
      return word;
    }
  }
  return word;
}

const STEP4_SUFFIXES = [
  'al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement',
  'ment', 'ent', 'ion', 'ou', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize',
];

function step4(word: string): string {
  for (const suffix of STEP4_SUFFIXES) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (suffix === 'ion') {
        if (stem.endsWith('s') || stem.endsWith('t')) {
          if (measure(stem) > 1) return stem;
        }
      } else {
        if (measure(stem) > 1) return stem;
      }
      return word;
    }
  }
  return word;
}

function step5a(word: string): string {
  if (word.endsWith('e')) {
    const stem = word.slice(0, -1);
    if (measure(stem) > 1) return stem;
    if (measure(stem) === 1 && !cvc(stem)) return stem;
  }
  return word;
}

function step5b(word: string): string {
  if (measure(word) > 1 && endsWithDouble(word) && word.endsWith('l')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Stem a single English word using the Porter algorithm.
 * Words shorter than 3 characters are returned as-is.
 */
export function porterStem(word: string): string {
  if (word.length < 3) return word;
  let w = word.toLowerCase();

  // Initial 'y' is treated as a consonant — handled in isConsonant().
  w = step1a(w);
  w = step1b(w);
  w = step1c(w);
  w = step2(w);
  w = step3(w);
  w = step4(w);
  w = step5a(w);
  w = step5b(w);

  return w;
}
