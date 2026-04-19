'use client';

import { useState } from 'react';

export function PersonalizedBriefingPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [signalsUsed, setSignalsUsed] = useState<number | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await fetch('/api/briefings/generate', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(
        body?.message ??
          'Could not generate your personalized briefing right now. Please retry in a moment.',
      );
      return;
    }
    setBriefing(body.briefing ?? null);
    setSignalsUsed(typeof body.signals_used === 'number' ? body.signals_used : null);
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">My AI briefing</h2>
          <p className="mt-1 text-xs text-white/55">
            Personalized to your topic and source settings. Beta limit: 2 AI briefing calls/day.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-60"
        >
          {loading ? 'Generating…' : 'Generate my briefing'}
        </button>
      </div>

      {signalsUsed != null && (
        <p className="mt-3 text-xs text-white/50">Generated from {signalsUsed} personalized signals.</p>
      )}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {briefing && (
        <pre className="mt-3 whitespace-pre-wrap rounded border border-white/10 bg-black/20 p-3 text-sm text-white/85">
          {briefing}
        </pre>
      )}
    </section>
  );
}
