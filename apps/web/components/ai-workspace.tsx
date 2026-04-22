'use client';

import { useEffect, useMemo, useState } from 'react';

type Session = { id: string; title: string; updated_at: string };
type Message = { id: string; role: 'user' | 'assistant' | 'system'; content: string; created_at: string };

export function AiWorkspace() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function load(sessionId?: string | null) {
    const qp = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    const res = await fetch(`/api/ai/chat${qp}`);
    if (!res.ok) return;
    const body = await res.json();
    setSessions(body.sessions ?? []);
    setMessages(body.messages ?? []);
    if (!activeSessionId && body.sessions?.[0]?.id) setActiveSessionId(body.sessions[0].id);
  }

  useEffect(() => {
    load(activeSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  async function send() {
    if (!input.trim()) return;
    setLoading(true);
    setStatus(null);
    const userText = input.trim();
    setInput('');

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: activeSessionId ?? undefined, message: userText }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus(body?.message ?? 'Could not send message right now.');
      return;
    }
    const body = await res.json();
    if (!activeSessionId && body.session_id) setActiveSessionId(body.session_id);
    await load(body.session_id ?? activeSessionId);
  }

  const activeTitle = useMemo(
    () => sessions.find((s) => s.id === activeSessionId)?.title ?? 'New chat',
    [sessions, activeSessionId],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-card border border-ink-100 bg-paper p-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Sessions</h2>
        <ul className="mt-2 space-y-1">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setActiveSessionId(s.id)}
                className={`w-full rounded-md px-2 py-2 text-left text-sm transition ${
                  s.id === activeSessionId ? 'bg-ink-100 text-ink' : 'text-ink-600 hover:bg-canvas-50'
                }`}
              >
                <p className="clamp-1">{s.title}</p>
                <p className="text-[11px] text-ink-400">{new Date(s.updated_at).toLocaleString()}</p>
              </button>
            </li>
          ))}
          {sessions.length === 0 && <li className="text-xs text-ink-400">No sessions yet.</li>}
        </ul>
      </aside>

      <section className="rounded-card border border-ink-100 bg-paper p-4">
        <h2 className="text-sm font-semibold">{activeTitle}</h2>
        <p className="mt-1 text-xs text-ink-500">
          Beta limit: up to 10 AI chat messages/day per user. Limits reset daily.
        </p>
        <div className="mt-3 max-h-[460px] space-y-2 overflow-auto pr-1">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-md p-3 text-sm ${
                m.role === 'assistant'
                  ? 'border border-brand-200 bg-brand-500/[0.08]'
                  : 'border border-ink-100 bg-canvas-50'
              }`}
            >
              <p className="mb-1 text-[10px] uppercase tracking-wide text-ink-400">{m.role}</p>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
          {messages.length === 0 && <p className="text-sm text-ink-500">Start your first analyst query.</p>}
        </div>
        <div className="mt-3 flex gap-2">
          <textarea
            rows={3}
            className="flex-1 rounded-md border border-ink-100 bg-canvas-50 px-3 py-2 text-sm outline-none focus:border-brand-300"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about agreement, conflicts, or evidence gaps across sources…"
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || !input.trim()}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Send'}
          </button>
        </div>
        {status && <p className="mt-2 text-sm text-amber-700">{status}</p>}
      </section>
    </div>
  );
}
