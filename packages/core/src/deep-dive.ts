/**
 * Deep Dive — per-signal claim verification engine.
 *
 * Combines:
 *   1. LLM claim extraction (Groq llama-3.1-8b)
 *   2. Search query generation (Groq llama-3.1-8b)
 *   3. Web research (Groq Compound — web search + site visits)
 *   4. Live sensor queries (USGS, FIRMS — direct API, no LLM)
 *   5. Synthesis (Gemini 2.5 Flash-Lite — structured verdict)
 *
 * The user sees every step: the claims extracted, the questions asked,
 * the sources found, the sensor data, and the final assessment.
 *
 * Budget: ~3-4 LLM calls per dive. ~80 dives/day on free tier.
 */

// ── Types ───────────────────────────────────────────────────────────────

export interface Claim {
  id: string;
  statement: string;
  category: 'numeric' | 'causal' | 'attribution' | 'location' | 'status' | 'general';
  importance: 'high' | 'medium' | 'low';
}

export interface ResearchQuery {
  claim_id: string;
  query: string;
}

export interface ResearchFinding {
  claim_id: string;
  query: string;
  sources: Array<{
    url: string;
    title: string;
    excerpt: string;
  }>;
  summary: string;
  supports_claim: boolean | null;
}

export interface SensorReading {
  source: string;
  type: 'seismic' | 'thermal' | 'weather' | 'satellite';
  data: Record<string, unknown>;
  summary: string;
  confirms_event: boolean | null;
  timestamp: string;
}

export interface ClaimVerdict {
  claim_id: string;
  statement: string;
  verdict: 'supported' | 'disputed' | 'unverified' | 'partially_supported';
  confidence: number;
  supporting_sources: string[];
  contradicting_sources: string[];
  sensor_confirmation: string | null;
  explanation: string;
}

export interface DeepDiveResult {
  claims: Claim[];
  research: ResearchFinding[];
  sensor_data: SensorReading[];
  verdicts: ClaimVerdict[];
  overall_verdict: 'corroborated' | 'mixed' | 'disputed' | 'unverified';
  summary: string;
  research_duration_ms: number;
}

// ── Prompt templates ────────────────────────────────────────────────────

export const CLAIM_EXTRACTION_PROMPT = `You are a fact-checker extracting verifiable claims from a news article.

Given the following article title, summary, and evidence excerpts, extract the specific factual claims being made.
Focus on claims that can be verified: numbers, causes, attributions, locations, status changes.
Do NOT extract opinions, predictions, or editorial commentary.

Respond with a JSON array of claims. Each claim must have:
- "id": a short unique identifier like "c1", "c2"
- "statement": the specific factual claim as a clear sentence
- "category": one of "numeric", "causal", "attribution", "location", "status", "general"
- "importance": "high" for claims central to the story, "medium" for supporting details, "low" for minor points

Extract 3-6 claims maximum, prioritizing the most important and verifiable ones.

Article:
{ARTICLE_TEXT}

Respond ONLY with valid JSON array, no other text.`;

export const QUERY_GENERATION_PROMPT = `You are a research assistant generating web search queries to verify news claims.

For each claim below, generate 2 targeted search queries that would find corroborating or contradicting evidence.
The queries should be specific enough to find relevant results but not so narrow they return nothing.
Include the key entities (names, places, numbers) from the claim.

Claims:
{CLAIMS_TEXT}

Respond with a JSON array of objects with:
- "claim_id": the claim id
- "query": the search query string

Generate exactly 2 queries per claim. Respond ONLY with valid JSON array, no other text.`;

export const SYNTHESIS_PROMPT = `You are an impartial analyst synthesizing research findings about news claims.
You NEVER assert truth or falsehood — you describe what the evidence shows.

For each claim, assess the research findings and sensor data, then provide:
- "verdict": "supported" (multiple independent sources confirm), "disputed" (sources contradict), "partially_supported" (some evidence but incomplete), or "unverified" (insufficient evidence found)
- "confidence": 0-100 based on quality and quantity of evidence
- "supporting_sources": list of source domains that support the claim
- "contradicting_sources": list of source domains that contradict the claim
- "sensor_confirmation": if physical sensor data (USGS seismic, NASA thermal/satellite, NOAA weather) is relevant, describe what it shows. null if not applicable.
- "explanation": 1-2 sentences describing the evidence landscape. Use hedged, observational language ("reporting indicates", "evidence suggests", "sources describe"). Never say "this is true/false".

Also provide:
- "overall_verdict": "corroborated" (most claims supported), "mixed" (some supported, some disputed), "disputed" (key claims contradicted), or "unverified" (insufficient evidence)
- "summary": A 2-3 sentence overview of what the research found, suitable for display to readers.

Claims:
{CLAIMS_TEXT}

Research findings:
{RESEARCH_TEXT}

Sensor data:
{SENSOR_TEXT}

Respond with a JSON object containing:
- "verdicts": array of verdict objects (one per claim)
- "overall_verdict": string
- "summary": string

Respond ONLY with valid JSON, no other text.`;

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Parse JSON from LLM output, handling markdown code fences.
 */
export function parseLLMJson<T>(text: string): T | null {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]) as T; } catch { /* fall through */ }
    }
    return null;
  }
}

/**
 * Build the article text block for claim extraction.
 */
export function buildArticleText(
  title: string,
  summary: string | null,
  evidenceExcerpts: string[],
): string {
  let text = `Title: ${title}`;
  if (summary) text += `\nSummary: ${summary}`;
  if (evidenceExcerpts.length > 0) {
    text += `\n\nSource reports:\n${evidenceExcerpts.map((e, i) => `[${i + 1}] ${e}`).join('\n')}`;
  }
  return text.slice(0, 4000);
}
