'use client';

import { useState } from 'react';

export function PersonalizedBriefingPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [signalsUsed, setSignalsUsed] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

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
    setRemaining(typeof body.remaining_estimate === 'number' ? body.remaining_estimate : null);
  }

  return (
    <section className="rounded-card border border-brand-200 bg-brand-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">My AI briefing</h2>
          <p className="mt-1 text-xs text-ink-500">
            Personalized to your topic, country, and source settings. Beta limit: 2 AI briefing calls/day.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-60"
        >
          {loading ? 'Generating…' : 'Generate my briefing'}
        </button>
      </div>

      <div className="mt-2 text-xs text-ink-500">
        {signalsUsed != null && <span>Using {signalsUsed} personalized signals. </span>}
        {remaining != null && <span>Remaining today: {remaining}.</span>}
      </div>
      {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}
      {briefing && (
        <pre className="mt-3 whitespace-pre-wrap rounded-md border border-ink-100 bg-black/30 p-3 text-sm leading-relaxed text-ink-700">
          {briefing}
        </pre>
      )}
    </section>
  );
}
