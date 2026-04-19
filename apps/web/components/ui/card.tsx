import React from 'react';

export function Card({
  title,
  action,
  children,
  className = '',
  tone = 'neutral',
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: 'neutral' | 'accent' | 'danger' | 'warn';
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-brand-500/35 bg-brand-500/[0.04]'
      : tone === 'danger'
        ? 'border-danger-500/35 bg-danger-500/[0.04]'
        : tone === 'warn'
          ? 'border-warn-500/35 bg-warn-500/[0.04]'
          : 'border-white/10 bg-white/[0.03]';

  return (
    <section className={`rounded-card border ${toneClass} p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {typeof title === 'string' ? (
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{title}</h2>
          ) : (
            title
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
