'use client';

import { useEffect, useState } from 'react';
import {
  loadProgress,
  rankProgress,
  type PlayerProgress,
} from '@/lib/gamification';

export function PlayerStatus({ compact = false }: { compact?: boolean }) {
  const [progress, setProgress] = useState<PlayerProgress | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<PlayerProgress>).detail;
      if (detail) setProgress(detail);
      else setProgress(loadProgress());
    };
    window.addEventListener('crosscheck:progress', onUpdate);
    return () => window.removeEventListener('crosscheck:progress', onUpdate);
  }, []);

  if (!progress) {
    return (
      <div className="h-14 animate-pulse rounded-2xl bg-ink-100/60" aria-hidden="true" />
    );
  }

  const { current, next, pct } = rankProgress(progress.xp);

  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-ink-100/80 bg-paper/80 px-3 py-2 shadow-sm backdrop-blur">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-signal text-xs font-bold text-white">
          {current.title.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-ink">{current.title}</span>
            <span className="tabular-nums text-ink-400">{progress.xp} XP</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-signal transition-all duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {progress.streak > 0 && (
          <span className="shrink-0 text-[11px] font-semibold text-flare" title="Day streak">
            {progress.streak}d
          </span>
        )}
      </div>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-ink-100 bg-paper p-5 shadow-card">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-signal/15 blur-2xl"
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-signal">
            Your rank
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
            {current.title}
          </h2>
          <p className="mt-1 text-sm text-ink-500">{current.blurb}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-ink">{progress.xp}</p>
          <p className="text-[11px] uppercase tracking-wider text-ink-400">XP</p>
          {progress.streak > 0 && (
            <p className="mt-2 text-sm font-semibold text-flare">{progress.streak}-day streak</p>
          )}
        </div>
      </div>
      <div className="relative mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-400">
          <span>{current.title}</span>
          <span>{next ? `${next.title} · ${next.minXp} XP` : 'Max rank'}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
          <div
            className="xp-fill h-full rounded-full bg-gradient-to-r from-signal to-flare"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </section>
  );
}
