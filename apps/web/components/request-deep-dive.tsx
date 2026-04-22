'use client';

import { useState, useEffect } from 'react';

type Status = 'idle' | 'requesting' | 'queued' | 'exists' | 'error';

export function RequestDeepDive({ signalId }: { signalId: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [polling, setPolling] = useState(false);

  // Poll for completion after request is queued
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/deep-dive/${signalId}`);
        if (res.ok) {
          setPolling(false);
          window.location.reload();
        }
      } catch { /* keep polling */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [polling, signalId]);

  async function handleRequest() {
    setStatus('requesting');
    try {
      const res = await fetch('/api/deep-dive/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_id: signalId }),
      });
      const data = await res.json();

      if (res.status === 429) {
        setStatus('error');
        setMessage(data.message || 'Too many requests. Please try again later.');
        return;
      }

      if (data.status === 'complete') {
        setStatus('exists');
        setMessage('Research is available.');
        window.location.reload();
      } else {
        setStatus('queued');
        setMessage('Research has been queued. This page will update when results are ready.');
        setPolling(true);
      }
    } catch {
      setStatus('error');
      setMessage('Could not submit request. Please try again.');
    }
  }

  if (status === 'queued') {
    return (
      <div className="rounded-card border border-brand-500/20 bg-brand-500/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-brand-500" />
          <p className="text-sm text-brand-400">{message}</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-card border border-red-500/20 bg-red-500/5 px-4 py-3">
        <p className="text-sm text-red-400">{message}</p>
      </div>
    );
  }

  return (
    <button
      onClick={handleRequest}
      disabled={status === 'requesting'}
      className="w-full rounded-card border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-white/60 transition hover:border-brand-500/30 hover:bg-brand-500/5 hover:text-white/80 disabled:opacity-50"
    >
      <span className="font-medium text-white/80">
        {status === 'requesting' ? 'Requesting...' : 'Request deep dive'}
      </span>
      <span className="ml-2 text-white/45">
        — extract claims, search for evidence, check sensor networks
      </span>
    </button>
  );
}
