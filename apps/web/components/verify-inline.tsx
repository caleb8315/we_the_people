'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function VerifyInline() {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    try { new URL(trimmed); } catch {
      setError('Enter a valid URL (include https://)');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/deep-dive/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();

      if (res.status === 429) {
        setError(data.message || 'Too many requests. Try again later.');
        setSubmitting(false);
        return;
      }

      if (data.signal_id) {
        router.push(`/signal/${data.signal_id}`);
      } else if (data.dive_id) {
        router.push(`/verify/${data.dive_id}`);
      } else {
        setUrl('');
        setSubmitting(false);
      }
    } catch {
      setError('Could not reach server. Check your connection.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="url"
        value={url}
        onChange={e => { setUrl(e.target.value); setError(''); }}
        placeholder="Paste any article URL to verify..."
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 pr-24 text-sm text-white placeholder-white/30 outline-none transition focus:border-brand-500/40 focus:bg-white/[0.06]"
        disabled={submitting}
      />
      <button
        type="submit"
        disabled={submitting || !url.trim()}
        className="absolute right-1.5 top-1.5 rounded-lg bg-brand-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-brand-400 disabled:opacity-40"
      >
        {submitting ? 'Checking...' : 'Verify'}
      </button>
      {error && (
        <p className="mt-1.5 text-xs text-red-400">{error}</p>
      )}
    </form>
  );
}
