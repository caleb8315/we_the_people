import type { EvidenceItem } from './types';
import { isFactCheckSource } from './outlet-profiles';

/**
 * Debunk / rebuttal detection for snippet-level evidence.
 *
 * Word overlap alone cannot tell "X happened" from "No, X did not happen":
 * a widely debunked hoax gets heavy credible coverage that *rejects* it.
 * These cues let the deterministic engine recognise rebuttals so that they
 * count against a claim instead of corroborating it.
 *
 * A cue only counts when it appears in the source text but NOT in the
 * claim text — otherwise a claim like "fake vaccine passports seized"
 * would make every matching report look like a debunk.
 */

const DEBUNK_CUES: RegExp[] = [
  // English
  /\bfalse(?:ly)?\b/i,
  /\bfake\b/i,
  /\bhoax(?:es)?\b/i,
  /\bdebunk(?:ed|s|ing)?\b/i,
  /\bmisleading\b/i,
  /\bno evidence\b/i,
  /\bfabricated\b/i,
  /\bdoctored\b/i,
  /\bnot true\b/i,
  /\bisn['’]t true\b/i,
  /\bdid(?: not|n['’]t) (?:happen|say|occur)\b/i,
  /\bbaseless\b/i,
  /\bunfounded\b/i,
  /\bmisinformation\b/i,
  /\bdisinformation\b/i,
  /\bout of context\b/i,
  /\bdigitally altered\b/i,
  /\bsatire\b/i,
  /\bfact[- ]check(?:ed)?\s*:/i,
  /^\s*no,\s/i,
  // Spanish / Portuguese / Italian
  /\bfals[oa]s?\b/i,
  /\bbulos?\b/i,
  /\bengaños[oa]s?\b/i,
  /\bdesmentid[oa]\b/i,
  /\benganos[oa]\b/i,
  /\bboatos?\b/i,
  /\bbufala\b/i,
  /\bfuorviante\b/i,
  // French
  /\bfaux\b/i,
  /\binfox\b/i,
  /\bintox\b/i,
  /\btrompeu(?:r|se)\b/i,
  // German / Dutch / Nordic
  /\bfalschmeldung\b/i,
  /\bfälschung\b/i,
  /\birreführend\b/i,
  /\bnepnieuws\b/i,
  // Turkish / Indonesian
  /\byalan\b/i,
  /\basılsız\b/i,
  /\bhoaks\b/i,
  // Non-Latin scripts (no \b — word boundaries are ASCII-only in JS regex)
  /фейк|неправда|дезинформац|опроверг|брехня/i,
  /كاذب|زائف|مضلل|مفبرك|شائعة/,
  /谣言|辟谣|不实|假新闻/,
  /デマ|偽情報|誤情報/,
  /가짜|허위/,
  /फर्जी|झूठ|भ्रामक/,
];

/** Cues present in `sourceText` that are absent from `claimText`. */
export function debunkCues(sourceText: string, claimText: string): string[] {
  const out: string[] = [];
  for (const re of DEBUNK_CUES) {
    const m = sourceText.match(re);
    if (!m) continue;
    if (re.test(claimText)) continue;
    out.push(m[0].trim());
  }
  return out;
}

export type RebuttalKind = 'debunks' | 'fact_check_context' | null;

/**
 * Classify a single evidence row against the claim it is being used for.
 *   - 'debunks'            the row reads as a rebuttal of the claim
 *   - 'fact_check_context' a fact-check about the topic with no clear rating in the snippet
 *   - null                 no rebuttal signal
 */
export function classifyRebuttal(e: Pick<EvidenceItem, 'url' | 'domain' | 'title' | 'excerpt'>, claimText: string): RebuttalKind {
  const text = `${e.title ?? ''} ${e.excerpt ?? ''}`;
  const cues = debunkCues(text, claimText);
  const factCheck = isFactCheckSource(e.url, e.domain);
  if (cues.length > 0) return 'debunks';
  if (factCheck) return 'fact_check_context';
  return null;
}
