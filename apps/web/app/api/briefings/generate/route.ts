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

  const text = await callBriefingModel(BRIEFING_SYSTEM_PROMPT, prompt);
  await logProductEvent(sb, {
    userId: auth.user.id,
    eventName: 'briefing_generated',
    eventProps: {
      signals_used: filtered.length,
      focus_topic_count: focus.size,
      country_filter_count: countries.size,
    },
  });
  return NextResponse.json({ briefing: text, signals_used: filtered.length, remaining_estimate: cap.limit - cap.used });
}

async function callBriefingModel(systemPrompt: string, prompt: string): Promise<string> {
  const env = serverEnv();
  const result = await runAiCompletion({
    providers: [
      { provider: 'gemini', apiKey: env.GEMINI_API_KEY },
      { provider: 'groq', apiKey: env.GROQ_API_KEY },
    ],
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: 0.35,
    maxTokens: 900,
  });
  if (result.text) return result.text;
  return 'Briefing generator is temporarily unavailable. Please retry later.';
}
