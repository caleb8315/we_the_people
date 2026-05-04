import { NextResponse } from 'next/server';
import { statusShortLabel } from '@osint/core';
import type { VerificationStatus } from '@osint/core/types';
import { runAiCompletion } from '@osint/core/ai-provider';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { consumeUserDailyLimit } from '@/lib/daily-limits';
import { serverEnv } from '@/lib/env';
import { logProductEvent } from '@/lib/product-events';

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
    'You are the Crosscheck analyst writing a concise personal briefing that describes how public reporting and sensor evidence agree, conflict, and where evidence is missing.',
    'Hard rules:',
    '- Never tell the reader what is correct or what happened. Describe how credible public sources are reporting it.',
    '- Prefer the words agreement, conflict, corroboration, confidence, evidence, and limitation.',
    '- When sources disagree, surface both sides rather than picking one.',
    '- Never accuse any person, group, or state of anything.',
    '- When sensor networks have not detected supporting evidence, say so plainly — never phrase absence as a denial of the event.',
    'Structure (use these exact section headings, in order):',
    '1. **Summary** — short orientation first. No more than 2 bullets.',
    '2. **Why it matters** — user-impact context in plain language. No hype.',
    '3. **Confirmed** — use only points supported by multiple independent sources or matching sensor evidence.',
    '4. **Disputed / uncertain** — list disagreements and evidence gaps without choosing a side.',
    '5. **Watch next** — concrete neutral checks readers should watch for.',
    '6. **Source note** — explain source count quality, republishing risk, and what evidence types were checked.',
    'Label each bullet with one of: Confirmed, Multiple independent sources, One source, Disputed, Missing evidence.',
    'Hard length cap: 350 words total.',
    '',
    'Signals:',
    ...filtered.map(
      (s, i) =>
        `${i + 1}. [${s.topic}] ${s.title} | sev=${s.severity} conf=${s.confidence} reliability=${statusShortLabel(s.verification_status as VerificationStatus)} | ${s.url ?? '-'}`,
    ),
  ].join('\n');

  const text = await callBriefingModel(prompt);
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

async function callBriefingModel(prompt: string): Promise<string> {
  const env = serverEnv();
  const result = await runAiCompletion({
    providers: [
      { provider: 'gemini', apiKey: env.GEMINI_API_KEY },
      { provider: 'groq', apiKey: env.GROQ_API_KEY },
    ],
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.35,
    maxTokens: 900,
  });
  if (result.text) return result.text;
  return 'Briefing generator is temporarily unavailable. Please retry later.';
}
