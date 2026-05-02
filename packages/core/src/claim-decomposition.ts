/**
 * Claim decomposition for Crosscheck Case Files.
 *
 * This module is intentionally deterministic and browser-safe. It turns a
 * user submission or signal headline into small, independently checkable
 * claim candidates. AI can improve extraction later, but these primitives are
 * the stable fallback and the contract every surface can rely on.
 */

export type ClaimKind =
  | 'event'
  | 'causal'
  | 'numeric'
  | 'quote'
  | 'legal'
  | 'medical'
  | 'scientific'
  | 'financial'
  | 'image'
  | 'identity'
  | 'prediction'
  | 'conspiracy'
  | 'unclear';

export type ClaimCheckability = 'high' | 'medium' | 'low' | 'not_checkable';
export type ClaimRiskLevel = 'normal' | 'sensitive' | 'high';

export interface AtomicClaim {
  id: string;
  text: string;
  normalized_text: string;
  kind: ClaimKind;
  entities: string[];
  dates: string[];
  locations: string[];
  checkability: ClaimCheckability;
  risk_level: ClaimRiskLevel;
  /** Short deterministic note explaining why the claim was shaped this way. */
  decomposition_note: string;
}

export interface DecomposeClaimsInput {
  title?: string | null;
  text?: string | null;
  url?: string | null;
  kind?: 'url' | 'text' | 'image' | 'signal';
  max_claims?: number;
}

const DEFAULT_MAX_CLAIMS = 8;

const SOFT_SPLIT_RX =
  /\s+(?:and|but|while|whereas|because|since|after|before|then|also|plus)\s+/i;

const DATE_RX =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{4})\b/gi;

const ENTITY_RX =
  /\b(?:[A-Z][a-z0-9&.'-]+(?:\s+[A-Z][a-z0-9&.'-]+){0,4}|[A-Z]{2,})\b/g;

const LOCATION_HINT_RX =
  /\b(?:in|near|around|outside|inside|across|from)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})\b/g;

const VAGUE_PATTERNS = [
  /\bthey\b/i,
  /\bsomething\b/i,
  /\beveryone knows\b/i,
  /\bthe truth\b/i,
  /\bwake up\b/i,
  /\bjust asking questions\b/i,
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/['"“”‘’]/g, '')
    .replace(/[^a-z0-9\s%$.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashId(prefix: string, text: string, index: number): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}_${index + 1}_${(h >>> 0).toString(36)}`;
}

function splitIntoCandidates(raw: string): string[] {
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/\bRT\s+@\w+:\s*/g, '')
    .trim();
  if (!cleaned) return [];

  const sentenceParts = cleaned
    .split(/(?<=[.!?])\s+|\n+|(?:\s*[;•]\s*)/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const sentence of sentenceParts.length > 0 ? sentenceParts : [cleaned]) {
    const parts = sentence
      .split(SOFT_SPLIT_RX)
      .map((s) => s.trim().replace(/^[,:\-\s]+|[,:\-\s]+$/g, ''))
      .filter((s) => s.length >= 18);
    if (parts.length <= 1) out.push(sentence);
    else out.push(...parts);
  }
  return out;
}

function classifyKind(text: string, ctxKind?: DecomposeClaimsInput['kind']): ClaimKind {
  const t = text.toLowerCase();
  if (ctxKind === 'image' || /\b(image|photo|video|screenshot|deepfake|ai[- ]?generated)\b/i.test(text)) {
    return 'image';
  }
  if (/\b(because|caused by|led to|triggered|responsible for|blamed|attributed to)\b/i.test(text)) {
    return 'causal';
  }
  if (/\b\d+(?:,\d{3})*(?:\.\d+)?\b|[$€£]\s?\d+|\d+%/i.test(text)) return 'numeric';
  if (/\b(said|says|claimed|according to|quote|told)\b/i.test(text) || /["“”]/.test(text)) return 'quote';
  if (/\b(court|lawsuit|judge|ruling|verdict|indictment|charged|convicted|legal|statute)\b/i.test(text)) {
    return 'legal';
  }
  if (/\b(vaccine|virus|covid|disease|cancer|drug|treatment|cdc|who|doctor|patient|medical)\b/i.test(text)) {
    return 'medical';
  }
  if (/\b(study|paper|scientists|research|peer[- ]reviewed|climate|physics|biology|experiment)\b/i.test(text)) {
    return 'scientific';
  }
  if (/\b(stock|shares|earnings|sec|filing|bank|inflation|market|crypto|bond|fed|revenue)\b/i.test(text)) {
    return 'financial';
  }
  if (/\b(cover[- ]?up|hidden|hiding|secret|they don't want|hoax|false flag|cabal|deep state|conspiracy)\b/i.test(text)) {
    return 'conspiracy';
  }
  if (/\b(is|are|was|were)\s+(?:actually|really)?\s*[A-Z][\w.-]+/i.test(text)) return 'identity';
  if (/\b(will|going to|expected to|forecast|predict|by \d{4})\b/i.test(text)) return 'prediction';
  if (/\b(happened|hit|killed|reported|confirmed|announced|launched|released)\b/i.test(text)) return 'event';
  return t.length > 0 ? 'event' : 'unclear';
}

function extractMatches(rx: RegExp, text: string): string[] {
  const out = new Set<string>();
  rx.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const value = (m[1] ?? m[0] ?? '').trim().replace(/[.,;:]+$/g, '');
    if (value.length >= 2 && value.length <= 80) out.add(value);
  }
  return [...out].slice(0, 8);
}

function checkabilityFor(text: string, kind: ClaimKind, entities: string[], dates: string[]): ClaimCheckability {
  const normalized = normalizeText(text);
  if (normalized.length < 12) return 'not_checkable';
  if (VAGUE_PATTERNS.some((rx) => rx.test(text))) return 'low';
  if (VAGUE_PATTERNS.some((rx) => rx.test(text)) && entities.length === 0) return 'low';
  if (kind === 'prediction') return 'low';
  if (kind === 'conspiracy' && entities.length === 0) return 'low';
  if (kind === 'quote' || kind === 'legal' || kind === 'financial' || kind === 'medical') {
    return entities.length > 0 || dates.length > 0 ? 'high' : 'medium';
  }
  if (entities.length >= 1 && (dates.length >= 1 || /\b\d/.test(text))) return 'high';
  if (entities.length >= 1 || dates.length >= 1) return 'medium';
  return 'medium';
}

function riskFor(text: string, kind: ClaimKind): ClaimRiskLevel {
  if (kind === 'medical') return 'high';
  if (/\b(suicide|self-harm|bomb|weapon|kill|attack instruction|dox|address|private person)\b/i.test(text)) {
    return 'high';
  }
  if (kind === 'legal' || kind === 'financial' || /\b(election|fraud|terrorist|traitor|pedophile|criminal)\b/i.test(text)) {
    return 'sensitive';
  }
  return 'normal';
}

function dedupeCandidates(candidates: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const norm = normalizeText(c);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(c.trim());
  }
  return out;
}

export function decomposeClaims(input: DecomposeClaimsInput): AtomicClaim[] {
  const maxClaims = input.max_claims ?? DEFAULT_MAX_CLAIMS;
  const sourceText = [input.title, input.text]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .join('. ')
    .trim();

  const rawCandidates = splitIntoCandidates(sourceText);
  const candidates = dedupeCandidates(rawCandidates).slice(0, maxClaims);

  if (candidates.length === 0 && input.url) {
    const fallback = `Submission from ${input.url}`;
    return [
      {
        id: hashId('claim', fallback, 0),
        text: fallback,
        normalized_text: normalizeText(fallback),
        kind: input.kind === 'image' ? 'image' : 'unclear',
        entities: [],
        dates: [],
        locations: [],
        checkability: 'low',
        risk_level: 'normal',
        decomposition_note: 'No natural-language claim was available; using the submitted URL as the case anchor.',
      },
    ];
  }

  return candidates.map((text, index) => {
    const entities = extractMatches(ENTITY_RX, text).filter((e) => !/^(The|This|That|There|Here|And|But)$/i.test(e));
    const dates = extractMatches(DATE_RX, text);
    const locations = extractMatches(LOCATION_HINT_RX, text);
    const kind = classifyKind(text, input.kind);
    const checkability = checkabilityFor(text, kind, entities, dates);
    return {
      id: hashId('claim', text, index),
      text,
      normalized_text: normalizeText(text),
      kind,
      entities,
      dates,
      locations,
      checkability,
      risk_level: riskFor(text, kind),
      decomposition_note:
        checkability === 'not_checkable'
          ? 'This fragment is too vague to check on its own.'
          : 'Extracted as an independently checkable part of the submission.',
    };
  });
}

