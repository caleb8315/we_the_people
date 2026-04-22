'use client';

import { useState, useTransition } from 'react';

/**
 * Phase 5 (shipped in Phase 1 for retention-loop readiness) — feedback
 * buttons on every signal detail page. Writes through the existing
 * `/api/feedback` route (authenticated users only). Silently hides itself
 * for unauthenticated readers.
 */

type Kind = 'useful' | 'wrong' | 'noise' | 'helpful_context';

const BUTTONS: Array<{ kind: Kind; label: string; short: string }> = [
  { kind: 'useful', label: 'Helpful', short: 'Helpful' },
  { kind: 'helpful_context', label: 'Unclear', short: 'Unclear' },
  { kind: 'wrong', label: 'Inaccurate', short: 'Wrong' },
];

export function SignalFeedbackButtons({ signalId }: { signalId: string }) {
  const [picked, setPicked] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (picked) {
    return (
      <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs text-brand-700">
        Thanks — feedback recorded.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-ink-400">Was this useful?</span>
      {BUTTONS.map((b) => (
        <button
          key={b.kind}
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              try {
                const res = await fetch('/api/feedback', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ signal_id: signalId, kind: b.kind }),
                });
                if (res.status === 401) {
                  setError('Sign in to send feedback.');
                  return;
                }
                if (!res.ok) {
                  setError('Could not send feedback.');
                  return;
                }
                setPicked(b.kind);
              } catch {
                setError('Network error.');
              }
            });
          }}
          className="inline-flex min-h-[44px] items-center rounded-full border border-ink-100 bg-paper px-3 py-1.5 text-xs text-ink-600 hover:border-ink-200 hover:text-ink disabled:opacity-50"
        >
          {b.label}
        </button>
      ))}
      {error && <span className="text-[11px] text-danger-600">{error}</span>}
    </div>
  );
}
