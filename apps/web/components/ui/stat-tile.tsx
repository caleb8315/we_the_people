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
      ? 'border-brand-500/35 bg-brand-500/[0.06]'
      : tone === 'danger'
        ? 'border-danger-500/35 bg-danger-500/[0.06]'
        : tone === 'warn'
          ? 'border-warn-500/35 bg-warn-500/[0.06]'
          : 'border-white/10 bg-white/[0.03]';

  const content = (
    <div className={`rounded-card border ${toneClass} p-4 transition hover:bg-white/[0.06]`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/55">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/55">{hint}</p>}
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
