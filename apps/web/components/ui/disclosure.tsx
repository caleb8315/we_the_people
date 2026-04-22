'use client';

import React, { useState } from 'react';

export function Disclosure({
  title,
  badge,
  defaultOpen = false,
  tone = 'neutral',
  children,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  tone?: 'neutral' | 'danger' | 'warn';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const borderClass =
    tone === 'danger' ? 'border-red-500/20' :
    tone === 'warn' ? 'border-amber-500/20' :
    'border-zinc-800';

  return (
    <section className={`rounded-2xl border ${borderClass} bg-zinc-900/40 backdrop-blur-sm`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          {title}
          {badge}
        </span>
        <span className="text-xs text-zinc-600">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="border-t border-zinc-800/50 px-5 py-4">{children}</div>}
    </section>
  );
}
