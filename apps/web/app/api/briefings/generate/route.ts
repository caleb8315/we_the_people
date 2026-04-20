import { NextResponse } from 'next/server';
import { statusShortLabel } from '@osint/core';
import type { VerificationStatus } from '@osint/core/types';
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
    'Structure:',
    '- Top 5 developments (one sentence each, with 1–2 citation-style references)',
    '- What changed in the last 24 hours (agreement shifts, new disagreements, new sensor confirmations)',
    '- What to watch next',
    'Each item should note how well the reporting is corroborated (corroborated / developing / single-source) and the confidence band.',
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
  if (env.GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.35, maxOutputTokens: 900 },
          }),
        },
      );
      if (res.ok) {
        const j = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      }
    } catch {
      // continue fallback
    }
  }
  if (env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.35,
          max_tokens: 900,
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = j.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch {
      // fall through
    }
  }
  return 'Briefing generator is temporarily unavailable. Please retry later.';
}
