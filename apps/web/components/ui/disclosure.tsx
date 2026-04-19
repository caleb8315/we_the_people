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
      ? 'border-danger-500/30 bg-danger-500/5'
      : tone === 'warn'
        ? 'border-warn-500/30 bg-warn-500/5'
        : 'border-white/10 bg-white/[0.03]';

  return (
    <section className={`rounded-card border ${toneClass}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-left hover:bg-white/[0.04]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span>{title}</span>
          {badge}
        </span>
        <span aria-hidden="true" className="text-xs text-white/50">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && <div className="border-t border-white/10 px-4 py-3">{children}</div>}
    </section>
  );
}
