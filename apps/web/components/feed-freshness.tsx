'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Feed freshness indicator + auto-refresh.
 *
 * What the user sees:
 *   - A green pulsing dot + "Live · last update Xm ago" line right under
 *     the feed header, so it's obvious how recent the data is.
 *   - A small "Refresh now" button if they want to force a re-fetch.
 *
 * Auto-refresh behavior:
 *   - Calls `router.refresh()` on a 60-second interval. This re-runs
 *     the Server Component (Next 14 dynamic page) without scrolling
 *     the user or losing scroll position, so any new signals from the
 *     :15-minute ingest or :5-minute sensor lane appear without F5.
 *   - Pauses while the tab is hidden (`document.visibilityState`) so
 *     we don't burn server time on backgrounded tabs.
 *   - Skips refresh while a transition is already pending so we never
 *     stack overlapping requests.
 *
 * The component is intentionally tiny and deterministic — no external
 * state, no websockets, no SSE, just the existing SSR endpoint.
 */
export function FeedFreshness({ latestIso }: { latestIso: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tick, setTick] = useState(0);
  const [autoRefreshOn, setAutoRefreshOn] = useState(true);

  // Re-render once a minute so the "Xm ago" label stays current even
  // when no auto-refresh fires.
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-refresh loop.
  useEffect(() => {
    if (!autoRefreshOn) return;
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (isPending) return;
      startTransition(() => router.refresh());
    }, 60_000);
    return () => window.clearInterval(id);
  }, [autoRefreshOn, isPending, router]);

  function refreshNow() {
    if (isPending) return;
    startTransition(() => router.refresh());
  }

  const ageLabel = latestIso ? formatAge(latestIso, tick) : null;
  const isFresh = latestIso ? Date.now() - new Date(latestIso).getTime() < 30 * 60_000 : false;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-500">
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
          isFresh ? 'bg-emerald-500 motion-safe:animate-pulse' : 'bg-amber-500'
        }`}
      />
      <span>
        {isFresh ? 'Live' : 'Updating'}
        {ageLabel && ' · last new signal '}
        {ageLabel && <strong className="text-ink-700">{ageLabel}</strong>}
      </span>
      <span aria-hidden="true">·</span>
      <span className="text-ink-400">
        Sensors poll every 5 min, full ingest every 15 min, develop every 30 min.
      </span>
      <button
        type="button"
        onClick={refreshNow}
        disabled={isPending}
        className="ml-1 inline-flex h-7 items-center gap-1 rounded-full border border-ink-100 bg-paper px-2.5 text-[11px] font-medium text-ink-600 hover:border-ink-200 hover:text-ink disabled:opacity-60"
      >
        {isPending ? (
          <>
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full border-[2px] border-ink-200 border-t-amber-500 motion-safe:animate-spin"
            />
            Refreshing
          </>
        ) : (
          <>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Refresh now
          </>
        )}
      </button>
      <button
        type="button"
        onClick={() => setAutoRefreshOn((v) => !v)}
        className="text-[11px] text-ink-400 underline hover:text-ink-600"
        title="When on, the feed refreshes every 60 seconds while this tab is open."
      >
        {autoRefreshOn ? 'Pause auto-refresh' : 'Resume auto-refresh'}
      </button>
    </div>
  );
}

function formatAge(iso: string, _tick: number): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}
