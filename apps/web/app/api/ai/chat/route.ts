import { NextResponse } from 'next/server';
import { z } from 'zod';
import { statusShortLabel } from '@osint/core';
import type { VerificationStatus } from '@osint/core/types';
import { runAiCompletion, type AiMessage } from '@osint/core/ai-provider';
import { getServerSupabase } from '@/lib/supabase-server';
import { DEFAULT_AI_SYSTEM_PROMPT } from '@/lib/ai-defaults';
import { getClientKey, limit } from '@/lib/rate-limit';
import { serverEnv } from '@/lib/env';
import { consumeUserDailyLimit } from '@/lib/daily-limits';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  session_id: z.string().uuid().optional(),
  message: z.string().min(1).max(3000),
});

/**
 * MVP AI chat endpoint with strict user isolation.
 *
 * - Stores per-user conversation state in ai_sessions/ai_messages.
 * - Uses user's ai_profile settings with Gemini/Groq fallback.
 * - No cross-user data reads (RLS + explicit user_id checks).
 */
export async function GET(req: Request) {
  const rl = limit(getClientKey(req, 'ai-chat-get'), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  const { data: sessions, error: sessionsErr } = await sb
    .from('ai_sessions')
    .select('id, title, updated_at, created_at')
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false })
    .limit(30);

  if (sessionsErr) return NextResponse.json({ error: sessionsErr.message }, { status: 500 });

  if (!sessionId) return NextResponse.json({ sessions: sessions ?? [], messages: [] });

  const { data: messages, error: msgErr } = await sb
    .from('ai_messages')
    .select('id, role, content, provider, created_at')
    .eq('session_id', sessionId)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: true })
    .limit(200);

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
  return NextResponse.json({ sessions: sessions ?? [], messages: messages ?? [] });
}

export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'ai-chat-post'), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const chatLimit = await consumeUserDailyLimit(sb, auth.user.id, 'ai_chat');
  if (!chatLimit.ok) {
    return NextResponse.json(
      {
        error: 'beta_daily_limit',
        message:
          'You hit your daily AI chat limit (10) for this beta. This keeps quality high and costs stable while we iterate. Please come back tomorrow.',
        used: chatLimit.used,
        limit: chatLimit.limit,
      },
      { status: 429 },
    );
  }

  let sessionId = parsed.data.session_id;

  if (!sessionId) {
    const { data: created, error: createErr } = await sb
      .from('ai_sessions')
      .insert({ user_id: auth.user.id, title: parsed.data.message.slice(0, 60) || 'New chat' })
      .select('id')
      .single();
    if (createErr || !created) {
      return NextResponse.json({ error: createErr?.message ?? 'session_create_failed' }, { status: 500 });
    }
    sessionId = created.id;
  } else {
    // Ensure session belongs to this user.
    const { data: session, error: sessionErr } = await sb
      .from('ai_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (sessionErr || !session) return NextResponse.json({ error: 'invalid_session' }, { status: 404 });
  }

  const { error: userMsgErr } = await sb.from('ai_messages').insert({
    session_id: sessionId,
    user_id: auth.user.id,
    role: 'user',
    content: parsed.data.message,
    provider: 'mvp-local',
  });
  if (userMsgErr) return NextResponse.json({ error: userMsgErr.message }, { status: 500 });

  const { data: aiProfile } = await sb
    .from('ai_profiles')
    .select('model, system_prompt, temperature, max_output_tokens')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const [{ data: prefs }, { data: rawSignals }, { data: sourceRows }, { data: recentBriefings }] =
    await Promise.all([
      sb
        .from('preferences')
        .select('topics, muted_sources, countries_of_focus, weather_label, weather_lat, weather_lon')
        .eq('user_id', auth.user.id)
        .maybeSingle(),
      sb
        .from('signals_public')
        .select('id, title, summary, topic, severity, confidence, verification_status, source_id, first_seen_at, url, country_code')
        .order('first_seen_at', { ascending: false })
        .limit(60),
      sb.from('sources').select('id, name, kind, credibility').eq('enabled', true).limit(300),
      sb
        .from('briefings')
        .select('headline, period_start, topics')
        .order('period_start', { ascending: false })
        .limit(3),
    ]);

  const mutedSources = new Set((prefs?.muted_sources ?? []) as string[]);
  const focusTopics = new Set((prefs?.topics ?? []) as string[]);
  const filteredSignals = (rawSignals ?? []).filter((s) => !s.source_id || !mutedSources.has(s.source_id));
  const focusSignals = filteredSignals
    .filter((s) => focusTopics.size === 0 || focusTopics.has(String(s.topic ?? 'other')))
    .sort((a, b) => Number(b.severity ?? 0) - Number(a.severity ?? 0))
    .slice(0, 12);

  const sourcesById = new Map((sourceRows ?? []).map((s) => [s.id, s]));
  const sourcesInUse = [...new Set(focusSignals.map((s) => s.source_id).filter(Boolean))]
    .map((id) => sourcesById.get(String(id)))
    .filter(Boolean)
    .slice(0, 10);

  const grounding = buildGroundingContext({
    prefs: {
      topics: (prefs?.topics ?? []) as string[],
      countries: (prefs?.countries_of_focus ?? []) as string[],
      weatherLabel: prefs?.weather_label ?? null,
      weatherLat: prefs?.weather_lat ?? null,
      weatherLon: prefs?.weather_lon ?? null,
    },
    signals: focusSignals as Array<any>,
    sources: sourcesInUse as Array<any>,
    briefings: (recentBriefings ?? []) as Array<any>,
  });

  const { data: contextRows } = await sb
    .from('ai_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(12);

  const context = [...(contextRows ?? [])].reverse();
  const assistantReply = await generateAssistantReply({
    systemPrompt: aiProfile?.system_prompt || DEFAULT_AI_SYSTEM_PROMPT,
    model: aiProfile?.model ?? 'gemini-2.0-flash',
    temperature: Number(aiProfile?.temperature ?? 0.4),
    maxOutputTokens: aiProfile?.max_output_tokens ?? 600,
    context: [
      ...context,
      {
        role: 'system',
        content: grounding,
      },
    ],
  });

  const { error: asstErr } = await sb.from('ai_messages').insert({
    session_id: sessionId,
    user_id: auth.user.id,
    role: 'assistant',
    content: assistantReply,
    provider: aiProfile?.model ?? 'fallback',
  });
  if (asstErr) return NextResponse.json({ error: asstErr.message }, { status: 500 });

  await sb.from('ai_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);

  return NextResponse.json({
    session_id: sessionId,
    reply: assistantReply,
  });
}

async function generateAssistantReply(input: {
  systemPrompt: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  context: Array<{ role: string; content: string }>;
}): Promise<string> {
  const env = serverEnv();

  const baseMessages: AiMessage[] = [
    { role: 'system', content: input.systemPrompt },
    ...input.context.map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user') as AiMessage['role'],
      content: m.content,
    })),
  ];

  const messages = compactForModel(baseMessages, 14_000);

  const result = await runAiCompletion({
    providers: [
      { provider: 'gemini', apiKey: env.GEMINI_API_KEY, model: input.model },
      { provider: 'groq', apiKey: env.GROQ_API_KEY },
    ],
    messages,
    temperature: input.temperature,
    maxTokens: input.maxOutputTokens,
  });

  if (result.text) return result.text;
  return 'AI provider unavailable right now. Your message was saved to your private session; retry in a few minutes.';
}

function buildGroundingContext(input: {
  prefs: {
    topics: string[];
    countries: string[];
    weatherLabel: string | null;
    weatherLat: number | null;
    weatherLon: number | null;
  };
  signals: Array<{
    id: string;
    title: string;
    summary: string | null;
    topic: string | null;
    severity: number;
    confidence: number;
    verification_status: string;
    source_id: string | null;
    first_seen_at: string;
    url: string | null;
    country_code: string | null;
  }>;
  sources: Array<{ id: string; name: string; kind: string; credibility: number }>;
  briefings: Array<{ headline: string; period_start: string; topics: string[] }>;
}) {
  const signalLines = input.signals.slice(0, 12).map((s, i) => {
    const ts = s.first_seen_at ? new Date(s.first_seen_at).toISOString() : 'n/a';
    const reliability = statusShortLabel(s.verification_status as VerificationStatus);
    return `${i + 1}. [${s.topic ?? 'other'}] ${s.title} | sev=${s.severity} conf=${s.confidence} reliability=${reliability} country=${s.country_code ?? '-'} time=${ts} url=${s.url ?? '-'}`;
  });
  const sourceLines = input.sources.map((s) => `${s.name} (${s.kind}, cred ${s.credibility})`);
  const briefingLines = input.briefings.map((b) => `${new Date(b.period_start).toISOString()} :: ${b.headline}`);

  return [
    'LIVE PLATFORM CONTEXT (PRIVATE TO CURRENT USER)',
    `Focus topics: ${input.prefs.topics.join(', ') || 'none set'}`,
    `Focus countries: ${input.prefs.countries.join(', ') || 'none set'}`,
    `Weather location: ${input.prefs.weatherLabel ?? 'none set'} (${input.prefs.weatherLat ?? '-'}, ${input.prefs.weatherLon ?? '-'})`,
    '',
    'Recent signals from this user feed:',
    signalLines.join('\n') || 'No signals available.',
    '',
    'Recent briefings:',
    briefingLines.join('\n') || 'No briefings available.',
    '',
    'Primary active sources in this context:',
    sourceLines.join('\n') || 'No source metadata available.',
    '',
    'INSTRUCTIONS:',
    '- Answer as a journalist using this context first.',
    '- If context is stale or missing, say so clearly and propose next checks.',
    '- Cite concrete signal/source lines in your response when possible.',
  ].join('\n');
}

function compactForModel<T extends { role: string; content: string }>(
  messages: T[],
  maxChars: number,
): T[] {
  const out = [...messages];
  while (out.map((m) => m.content.length).reduce((a, b) => a + b, 0) > maxChars && out.length > 4) {
    out.splice(1, 1);
  }
  return out;
}
