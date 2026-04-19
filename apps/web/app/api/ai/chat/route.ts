import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { serverEnv } from '@/lib/env';

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

  const { data: contextRows } = await sb
    .from('ai_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(12);

  const context = [...(contextRows ?? [])].reverse();
  const assistantReply = await generateAssistantReply({
    systemPrompt:
      aiProfile?.system_prompt ||
      'You are an OSINT analyst. Be concise, cite likely evidence types, avoid accusations, and label uncertainty.',
    model: aiProfile?.model ?? 'gemini-2.0-flash',
    temperature: Number(aiProfile?.temperature ?? 0.4),
    maxOutputTokens: aiProfile?.max_output_tokens ?? 600,
    context,
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

  const messages = [
    { role: 'system', content: input.systemPrompt },
    ...input.context.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  ];

  if (env.GEMINI_API_KEY) {
    try {
      const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: input.temperature,
              maxOutputTokens: input.maxOutputTokens,
            },
          }),
        },
      );
      if (res.ok) {
        const j = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      }
    } catch {
      // fall through to Groq
    }
  }

  if (env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: input.temperature,
          max_tokens: input.maxOutputTokens,
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

  return 'AI provider unavailable right now. Your message was saved to your private session; retry in a few minutes.';
}
