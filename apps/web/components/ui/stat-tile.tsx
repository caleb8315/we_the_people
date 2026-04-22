import Link from 'next/link';
import React from 'react';

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'danger' | 'warn';
  href?: string;
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-brand-200 bg-brand-50'
      : tone === 'danger'
        ? 'border-danger-200 bg-danger-50'
        : tone === 'warn'
          ? 'border-amber-200 bg-amber-50'
          : 'border-ink-100 bg-paper';

  const content = (
    <div className={`rounded-card border ${toneClass} p-4 transition hover:bg-canvas-50`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}
