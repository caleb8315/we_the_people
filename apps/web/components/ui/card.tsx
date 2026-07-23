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
      ? 'border-primary-200 bg-primary-50/60'
      : tone === 'danger'
        ? 'border-danger-200 bg-danger-50/60'
        : tone === 'warn'
          ? 'border-flare-200 bg-flare-50/60'
          : 'border-ink-100 bg-paper';

  return (
    <section className={`rounded-card border ${toneClass} p-5 shadow-card ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {typeof title === 'string' ? (
            <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
              {title}
            </h2>
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
