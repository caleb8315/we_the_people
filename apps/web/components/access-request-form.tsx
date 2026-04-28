'use client';

import { useState } from 'react';

type Result = { ok: boolean; message: string } | null;

export function AccessRequestForm({
  title = 'Request beta access',
  compact = false,
}: {
  title?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          reason: reason.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setResult({ ok: false, message: body?.error ?? 'Could not submit your request right now.' });
        return;
      }

      setResult({
        ok: true,
        message:
          'Request received. We review access requests manually and will invite approved emails for the current beta cohort.',
      });
      setReason('');
    } catch {
      setResult({ ok: false, message: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`rounded-card border border-ink-100 bg-paper ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-500">
        Crosscheck is still invite-only while we validate quality, reliability, and alert noise with
        small cohorts.
      </p>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-sm text-ink-600">
          <span className="mb-1 inline-block text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-ink-100 bg-canvas-50 px-3 py-2.5 outline-none transition focus:border-brand-300"
          />
        </label>

        <label className="block text-sm text-ink-600">
          <span className="mb-1 inline-block text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            What would you use it for? (optional)
          </span>
          <textarea
            rows={compact ? 3 : 4}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reporter monitoring source disagreements, disaster response research, newsroom workflow testing..."
            className="w-full rounded-xl border border-ink-100 bg-canvas-50 px-3 py-2.5 outline-none transition focus:border-brand-300"
          />
        </label>

        <button
          type="submit"
          disabled={loading || !email}
          className="rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-700 disabled:opacity-60"
        >
          {loading ? 'Submitting…' : 'Request access'}
        </button>
      </form>

      {result && (
        <p className={`mt-3 text-sm ${result.ok ? 'text-brand-700' : 'text-danger-600'}`}>{result.message}</p>
      )}
    </div>
  );
}
