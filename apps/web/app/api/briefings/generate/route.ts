import { NextResponse } from 'next/server';
import { statusShortLabel } from '@osint/core';
import type { VerificationStatus } from '@osint/core/types';
import { runAiCompletion } from '@osint/core/ai-provider';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { consumeUserDailyLimit } from '@/lib/daily-limits';
import { serverEnv } from '@/lib/env';
import { logProductEvent } from '@/lib/product-events';
import { BRIEFING_SYSTEM_PROMPT } from '@/lib/prompts/humanVoice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/briefings/generate
 * On-demand personalized briefing generation (max 2/day per user in beta).
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'briefing-generate'), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const cap = await consumeUserDailyLimit(sb, auth.user.id, 'briefing_call');
  if (!cap.ok) {
    return NextResponse.json(
      {
        error: 'beta_daily_limit',
        message:
          'You reached your daily personalized briefing limit (2/day) during beta. This helps us keep responses high quality while we tune costs.',
        used: cap.used,
        limit: cap.limit,
      },
      { status: 429 },
    );
  }

  const [{ data: prefs }, { data: signals }] = await Promise.all([
    sb
      .from('preferences')
      .select('topics, muted_sources, muted_topics, countries_of_focus')
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    sb
      .from('signals_public')
      .select(
        'title, summary, topic, severity, confidence, verification_status, source_id, first_seen_at, url, country_code',
      )
      .order('severity', { ascending: false })
      .limit(40),
  ]);

  const muted = new Set((prefs?.muted_sources ?? []) as string[]);
  const mutedTopics = new Set((prefs?.muted_topics ?? []) as string[]);
  const focus = new Set((prefs?.topics ?? []) as string[]);
  const countries = new Set((prefs?.countries_of_focus ?? []).map((c: string) => c.toUpperCase()));
  const filtered = (signals ?? [])
    .filter((s) => !s.source_id || !muted.has(s.source_id))
    .filter((s) => !mutedTopics.has(String(s.topic ?? 'other')))
    .filter((s) => focus.size === 0 || focus.has(String(s.topic ?? 'other')))
    .filter((s) => countries.size === 0 || countries.has(String(s.country_code ?? '').toUpperCase()))
    .slice(0, 12);

  const prompt = [
    'Write a personalized morning briefing using the stories below.',
    'Do not use bullets. Write in flowing prose with short paragraphs.',
    'Lead with the biggest story, explain what is confirmed, what is still disputed, and why it matters.',
    'Name the specific story in each paragraph using concrete details from the title (who/what/where).',
    'Avoid vague phrasing like "this story" unless you immediately specify the event details.',
    'End with one sentence that starts with "What to watch:"',
    'Hard cap: 300 words.',
    '',
    'Stories in this user context:',
    ...filtered.map(
      (s, i) =>
        `${i + 1}. [${s.topic}] ${s.title} | reliability=${statusShortLabel(
          s.verification_status as VerificationStatus,
        )} | severity=${s.severity} | ${s.url ?? '-'}`,
    ),
  ].join('\n');

  const completion = await callBriefingModel(BRIEFING_SYSTEM_PROMPT, prompt);
  const degraded = !completion.text;
  const text = completion.text ?? renderDeterministicBriefing(filtered);
  await logProductEvent(sb, {
    userId: auth.user.id,
    eventName: 'briefing_generated',
    eventProps: {
      signals_used: filtered.length,
      focus_topic_count: focus.size,
      country_filter_count: countries.size,
      provider: completion.provider,
      degraded,
    },
  });
  return NextResponse.json({
    briefing: text,
    signals_used: filtered.length,
    remaining_estimate: cap.limit - cap.used,
    provider: completion.provider,
    degraded,
  });
}

async function callBriefingModel(systemPrompt: string, prompt: string) {
  const env = serverEnv();
  const result = await runAiCompletion({
    providers: [
      { provider: 'xay', apiKey: env.XAY_API_KEY, model: 'gpt-4o-mini' },
      { provider: 'groq', apiKey: env.GROQ_API_KEY },
      { provider: 'gemini', apiKey: env.GEMINI_API_KEY },
    ],
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: 0.35,
    maxTokens: 900,
  });
  if (!result.text) {
    console.error('[briefing-generate] all providers failed', {
      reason: result.reason,
      attempts: result.attempts.map(({ provider, ok, status, error }) => ({
        provider,
        ok,
        status,
        error: error?.slice(0, 300),
      })),
    });
  }
  return result;
}

function renderDeterministicBriefing(
  signals: Array<{
    title: string;
    summary: string | null;
    verification_status: string;
  }>,
): string {
  if (signals.length === 0) {
    return 'No stories currently match your briefing preferences. Check your topic and country filters, then try again when new reporting arrives.';
  }

  const paragraphs = signals.slice(0, 4).map((signal, index) => {
    const status = statusShortLabel(signal.verification_status as VerificationStatus);
    const title = compactText(signal.title, 220);
    const summary = cleanFallbackSummary(signal.title, signal.summary);
    return [
      `${index + 1}. ${title}`,
      summary,
      `Evidence status: ${status}.`,
    ]
      .filter(Boolean)
      .join('\n');
  });

  return [
    paragraphs.join('\n\n'),
    `What to watch: New reporting or source disagreements affecting these ${paragraphs.length} leading ${paragraphs.length === 1 ? 'story' : 'stories'}.`,
  ].join('\n\n');
}

function cleanFallbackSummary(title: string, summary: string | null): string | null {
  if (!summary) return null;

  let cleaned = summary
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.toLocaleLowerCase().startsWith(title.toLocaleLowerCase())) {
    cleaned = cleaned.slice(title.length).replace(/^[\s.:;–—-]+/, '');
  }

  // Some feeds put the complete article body in `summary`. Do not dump it
  // into the deterministic fallback; the linked title and evidence status
  // remain useful without reproducing an unreviewed article.
  if (!cleaned || cleaned.length > 600) return null;
  return compactText(cleaned, 280);
}

function compactText(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxChars) return compact;
  const clipped = compact.slice(0, maxChars + 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > maxChars * 0.7 ? lastSpace : maxChars).trimEnd()}…`;
}
