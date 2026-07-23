'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  DAILY_MISSIONS,
  loadProgress,
  missionStatus,
  type PlayerProgress,
} from '@/lib/gamification';

export function DailyMissions() {
  const [progress, setProgress] = useState<PlayerProgress | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
    const onUpdate = () => setProgress(loadProgress());
    window.addEventListener('crosscheck:progress', onUpdate);
    return () => window.removeEventListener('crosscheck:progress', onUpdate);
  }, []);

  if (!progress) {
    return <div className="h-40 animate-pulse rounded-[28px] bg-ink-100/50" aria-hidden="true" />;
  }

  const doneCount = DAILY_MISSIONS.filter((m) => missionStatus(progress, m).done).length;

  return (
    <section className="rounded-[28px] border border-ink-100 bg-paper p-5 shadow-card">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-flare">
            Daily missions
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
            Earn XP. Stay sharp.
          </h2>
        </div>
        <p className="text-sm tabular-nums text-ink-500">
          {doneCount}/{DAILY_MISSIONS.length}
        </p>
      </header>
      <ul className="mt-4 space-y-3">
        {DAILY_MISSIONS.map((mission) => {
          const status = missionStatus(progress, mission);
          return (
            <li key={mission.id}>
              <Link
                href={mission.href}
                className={`group block rounded-2xl border px-4 py-3 transition ${
                  status.done
                    ? 'border-signal/30 bg-signal/5'
                    : 'border-ink-100 bg-canvas-50 hover:border-signal/40 hover:bg-paper'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {status.done ? '✓ ' : ''}
                      {mission.title}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">{mission.detail}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-ink-900 px-2 py-1 text-[11px] font-semibold text-white">
                    +{mission.xp} XP
                  </span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-signal transition-all duration-500"
                    style={{ width: `${status.pct}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-ink-400">
                  {status.count}/{mission.target}
                  {status.done ? ' · complete' : ''}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
