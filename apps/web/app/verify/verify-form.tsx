'use client';

import { useState } from 'react';

type Status = 'idle' | 'submitting' | 'pending' | 'complete' | 'error';

export function VerifyForm() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [diveId, setDiveId] = useState<string | null>(null);
  const [signalId, setSignalId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      setMessage('Please enter a valid URL (including https://).');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      const res = await fetch('/api/deep-dive/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setStatus('error');
        setMessage(data.message || 'Too many requests. Please try again later.');
        return;
      }

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setDiveId(data.dive_id);
      setSignalId(data.signal_id || null);

      if (data.status === 'complete') {
        setStatus('complete');
        setMessage(data.message);
      } else {
        setStatus('pending');
        setMessage(data.message);
      }
    } catch {
      setStatus('error');
      setMessage('Could not reach the server. Please check your connection and try again.');
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com/news-article"
          className="flex-1 rounded-lg border border-white/15 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/30"
          disabled={status === 'submitting'}
          required
        />
        <button
          type="submit"
          disabled={status === 'submitting' || !url.trim()}
          className="shrink-0 rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-black transition hover:bg-brand-400 disabled:opacity-50"
        >
          {status === 'submitting' ? 'Submitting...' : 'Verify'}
        </button>
      </form>

      {status === 'pending' && (
        <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 px-4 py-3">
          <p className="text-sm font-medium text-brand-400">Research queued</p>
          <p className="mt-1 text-sm text-white/70">{message}</p>
          <p className="mt-2 text-xs text-white/45">
            You can close this page. Results will be available at the link below once
            the next research cycle completes (runs 3 times daily).
          </p>
          {diveId && (
            <a
              href={signalId ? `/signal/${signalId}` : '#'}
              className="mt-2 inline-block text-xs text-brand-400 hover:underline"
            >
              {signalId ? 'View signal →' : `Research ID: ${diveId.slice(0, 8)}...`}
            </a>
          )}
        </div>
      )}

      {status === 'complete' && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <p className="text-sm font-medium text-emerald-400">Research already available</p>
          <p className="mt-1 text-sm text-white/70">{message}</p>
          {signalId && (
            <a
              href={`/signal/${signalId}`}
              className="mt-2 inline-block text-sm font-medium text-emerald-400 hover:underline"
            >
              View full report →
            </a>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-sm text-red-400">{message}</p>
        </div>
      )}
    </div>
  );
}
