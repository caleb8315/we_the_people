'use client';

import React, { useState } from 'react';

export function Disclosure({
  title,
  badge,
  defaultOpen = false,
  tone = 'neutral',
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  tone?: 'neutral' | 'danger' | 'warn';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toneClass =
    tone === 'danger'
      ? 'border-danger-200 bg-danger-50/60'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50/60'
        : 'border-ink-100 bg-paper';

  return (
    <section className={`rounded-card border shadow-card ${toneClass}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-left hover:bg-canvas-50"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span>{title}</span>
          {badge}
        </span>
        <span aria-hidden="true" className="text-xs text-ink-400">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && <div className="border-t border-ink-100 px-4 py-3">{children}</div>}
    </section>
  );
}
