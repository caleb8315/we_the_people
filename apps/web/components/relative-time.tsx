'use client';

/**
 * Hydration-safe relative-time label.
 *
 * Server-rendered feed cards use `Date.now()` to compute strings like
 * "7s ago", but by the time the browser hydrates a second or two later
 * the same call returns "8s ago" and React raises a hydration mismatch.
 *
 * This component renders a stable absolute timestamp on first paint
 * (SSR + first client render match byte-for-byte), then swaps in the
 * relative label on `useEffect` and refreshes it every 30s.
 */

import { useEffect, useState } from 'react';

export interface RelativeTimeProps {
  iso: string;
  className?: string;
}

export function RelativeTime({ iso, className }: RelativeTimeProps) {
  const [label, setLabel] = useState<string>(() => absoluteShort(iso));

  useEffect(() => {
    const update = () => setLabel(relativeShort(iso));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [iso]);

  return (
    <span className={className} suppressHydrationWarning>
      {label}
    </span>
  );
}

function absoluteShort(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  // Use UTC to guarantee SSR ≡ client regardless of runtime TZ.
  const d = new Date(t);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  return `${month} ${day}`;
}

function relativeShort(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return absoluteShort(iso);
}
