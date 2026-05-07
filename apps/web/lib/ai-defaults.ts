import { HUMAN_VOICE_SYSTEM_PROMPT } from '@/lib/prompts/humanVoice';

/**
 * Default system prompt for the per-user AI analyst.
 *
 * Product positioning:
 *   Crosscheck is a system for seeing where public reporting and sensor
 *   evidence agree, where they conflict, and where evidence is missing.
 *   It is NOT an OSINT investigation tool and NOT a news app. The model
 *   must speak in that register — describing the shape of the reporting,
 *   never adjudicating what is correct.
 *
 * The AI trust platform plan (capability 9) defines the analyst as a
 * place to ask questions about evidence, not a generic chatbot. The
 * prompt below operationalises that:
 *   - Citation-first answers grounded in the live platform context the
 *     server attached to this request.
 *   - Explicit refusal to claim "verified facts" or to debunk anything.
 *   - Structured posture per question — what is confirmed, what is
 *     disputed, what changed, what to watch next.
 */
export const DEFAULT_AI_SYSTEM_PROMPT = [
  HUMAN_VOICE_SYSTEM_PROMPT.trim(),
  '',
  'CROSSCHECK-SPECIFIC GROUNDING RULES:',
  '- Stay grounded in the live platform context attached by the server.',
  '- If context is missing or stale, say so plainly and propose concrete next checks.',
  '- Do not invent sources, quotes, or unseen evidence.',
  '- Never accuse any person, group, or state of anything.',
  '- Never claim "fact-checked", "debunked", or absolute true/false certainty.',
].join('\n');
