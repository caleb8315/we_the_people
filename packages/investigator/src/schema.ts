/**
 * Investigation report contract. Browser-safe: zod only, no Node imports,
 * so the web client can import types and labels from here directly.
 */
import { z } from 'zod';

export const VERDICTS = [
  'true',
  'mostly_true',
  'mixed',
  'misleading',
  'unproven',
  'false',
  'fabricated',
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CONFIDENCE = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const STANCES = ['supports', 'refutes', 'context'] as const;
export type CitationStance = (typeof STANCES)[number];

export const CONSPIRACY_LEVELS = ['none', 'some_traits', 'strong'] as const;
export type ConspiracyLevel = (typeof CONSPIRACY_LEVELS)[number];

export const PHYSICAL_RESULTS = ['consistent', 'inconsistent', 'inconclusive', 'no_data'] as const;
export type PhysicalResult = (typeof PHYSICAL_RESULTS)[number];

export const OWNERSHIP = [
  'state_controlled',
  'state_aligned',
  'state_funded',
  'public_broadcaster',
  'wire',
  'fact_checker',
  'government',
  'independent',
  'unknown',
] as const;

// ── What the model writes (synthesis step) ─────────────────────────────────

const citation = z.object({
  source_id: z.string().describe('Ledger id such as "S3". Must be a source you were shown.'),
  quote: z
    .string()
    .describe('Exact sentence or phrase copied verbatim from that source. Never paraphrase.'),
  stance: z.enum(STANCES),
});

export const ReportDraftSchema = z.object({
  headline_claim: z.string().describe('The central claim being checked, in one neutral sentence (English).'),
  verdict: z.enum(VERDICTS),
  confidence: z.enum(CONFIDENCE),
  confidence_reason: z.string(),
  bottom_line: z.string().describe('Two or three plain sentences a busy reader can trust.'),
  is_it_fake: z.object({
    answer: z.enum(['yes', 'no', 'partly', 'unclear']),
    explanation: z.string(),
  }),
  conspiracy: z.object({
    level: z.enum(CONSPIRACY_LEVELS),
    traits: z
      .array(z.string())
      .describe('Specific conspiracy-theory traits present, e.g. "unfalsifiable", "secret coordinated actors", "moving goalposts".'),
    documented_real_conspiracy: z
      .boolean()
      .describe('True only if courts, official inquiries, or primary documents establish an actual conspiracy.'),
    explanation: z.string(),
  }),
  what_is_true: z
    .string()
    .describe('What the evidence actually establishes, with [S#] markers after each factual sentence.'),
  claims: z
    .array(
      z.object({
        text: z.string(),
        verdict: z.enum(VERDICTS),
        explanation: z.string(),
        citations: z.array(citation),
      }),
    )
    .min(1),
  sides: z
    .array(
      z.object({
        perspective: z.string().describe('Who holds this view, e.g. "Russian state media", "Ukrainian officials", "International wires".'),
        countries: z.array(z.string()).describe('ISO 3166-1 alpha-2 codes'),
        position: z.string().describe('Their version of events, stated fairly in its strongest form.'),
        framing_notes: z.string().describe('What this side emphasises, omits, or frames differently.'),
        evidence_strength: z.enum(['strong', 'moderate', 'weak', 'none']),
        source_ids: z.array(z.string()),
      }),
    )
    .describe('Every substantively different perspective found, including ones you conclude are wrong.'),
  origin: z.object({
    earliest_source_id: z.string().nullable(),
    earliest_date: z.string().nullable().describe('ISO date if known'),
    description: z.string().describe('Where and how the claim first appeared and how it spread.'),
  }),
  manipulation_techniques: z.array(
    z.object({
      technique: z.string().describe('e.g. "Out-of-context image", "Misleading statistic", "Fake expert", "Emotional framing".'),
      explanation: z.string(),
      source_ids: z.array(z.string()),
    }),
  ),
  physical_check_findings: z.array(
    z.object({
      check_id: z.string().describe('Physical check id such as "P1".'),
      result: z.enum(PHYSICAL_RESULTS),
      interpretation: z.string().describe('What this observation does and does not show about the claim.'),
    }),
  ),
  open_questions: z.array(z.string()),
});
export type ReportDraft = z.infer<typeof ReportDraftSchema>;

// ── Final report (after citation verification + guardrails) ────────────────

export interface ReportSource {
  id: string;
  url: string;
  title: string | null;
  outlet: string;
  domain: string;
  country: string | null;
  language: string | null;
  ownership: (typeof OWNERSHIP)[number];
  ownership_note: string | null;
  published_at: string | null;
  retrieved_via: string;
  /** True when the full text was read, not just a search snippet. */
  read_full_text: boolean;
}

export interface PhysicalImagery {
  label: string;
  url: string;
  date: string | null;
  source: string;
}

export interface PhysicalCheck {
  id: string;
  kind:
    | 'earthquake'
    | 'natural_event'
    | 'fire_detection'
    | 'weather_history'
    | 'satellite_imagery'
    | 'night_lights';
  place: string | null;
  lat: number | null;
  lon: number | null;
  window: { start: string; end: string } | null;
  data_sources: string[];
  /** Deterministic summary of what the data returned (not model-written). */
  observation: string;
  hits: number;
  imagery: PhysicalImagery[];
  result: PhysicalResult;
  interpretation: string | null;
}

export interface VerifiedCitation {
  source_id: string;
  quote: string;
  stance: CitationStance;
}

export interface InvestigationReport {
  id: string;
  created_at: string;
  input: { kind: 'text' | 'url'; text: string | null; url: string | null };
  headline_claim: string;
  verdict: Verdict;
  confidence: Confidence;
  confidence_reason: string;
  bottom_line: string;
  is_it_fake: ReportDraft['is_it_fake'];
  conspiracy: ReportDraft['conspiracy'];
  what_is_true: string;
  claims: Array<{
    text: string;
    verdict: Verdict;
    explanation: string;
    citations: VerifiedCitation[];
  }>;
  sides: ReportDraft['sides'];
  origin: ReportDraft['origin'];
  manipulation_techniques: ReportDraft['manipulation_techniques'];
  physical_checks: PhysicalCheck[];
  open_questions: string[];
  sources: ReportSource[];
  coverage: {
    languages: string[];
    countries: string[];
    tools: Array<{ tool: string; calls: number; results: number }>;
    sources_found: number;
    sources_read: number;
    independent_outlets: number;
  };
  integrity: {
    citations_checked: number;
    citations_verified: number;
    citations_removed: number;
    guardrails: string[];
  };
  model: string;
  duration_ms: number;
}

// ── Streaming events ────────────────────────────────────────────────────────

export type InvestigationPhase = 'intake' | 'plan' | 'research' | 'synthesis' | 'verification' | 'done';

export type InvestigationEvent =
  | { type: 'phase'; phase: InvestigationPhase; message: string }
  | { type: 'plan'; claims: string[]; languages: string[]; places: string[] }
  | { type: 'tool_start'; id: string; tool: string; label: string }
  | { type: 'tool_end'; id: string; tool: string; ok: boolean; summary: string }
  | { type: 'source'; source: ReportSource }
  | { type: 'physical'; check: PhysicalCheck }
  | { type: 'note'; message: string }
  | { type: 'report'; report: InvestigationReport }
  | { type: 'error'; message: string };

// ── Display helpers ─────────────────────────────────────────────────────────

export const VERDICT_LABEL: Record<Verdict, string> = {
  true: 'True',
  mostly_true: 'Mostly true',
  mixed: 'Mixed',
  misleading: 'Misleading',
  unproven: 'Unproven',
  false: 'False',
  fabricated: 'Fabricated',
};

export const VERDICT_DESCRIPTION: Record<Verdict, string> = {
  true: 'The evidence supports the claim as stated.',
  mostly_true: 'The core claim holds, but some details are wrong or missing.',
  mixed: 'Parts of the claim are true and parts are false.',
  misleading: 'Built on something real, but framed or presented in a way that leads to a false conclusion.',
  unproven: 'There is not enough evidence either way to call it.',
  false: 'The evidence contradicts the claim.',
  fabricated: 'Invented: no basis in any real event, document, or statement.',
};

export const CONSPIRACY_LABEL: Record<ConspiracyLevel, string> = {
  none: 'No conspiracy-theory traits',
  some_traits: 'Some conspiracy-theory traits',
  strong: 'Strong conspiracy-theory pattern',
};
