import React from 'react';

export type BadgeVariant =
  | 'verified'
  | 'developing'
  | 'unverified'
  | 'quarantined'
  | 'blocked'
  | 'disputed'
  | 'new'
  | 'muted'
  | 'topic'
  | 'country'
  | 'neutral';

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  verified: 'bg-brand-50 text-brand-700 border-brand-200',
  developing: 'bg-amber-50 text-amber-700 border-amber-200',
  unverified: 'bg-canvas-100 text-ink-500 border-ink-100',
  quarantined: 'bg-danger-50 text-danger-700 border-danger-200',
  blocked: 'bg-danger-100 text-danger-700 border-danger-300',
  disputed: 'bg-danger-50 text-danger-700 border-danger-200',
  new: 'bg-brand-50 text-brand-700 border-brand-200',
  muted: 'bg-canvas-100 text-ink-400 border-ink-100',
  topic: 'bg-canvas-100 text-ink-600 border-ink-100',
  country: 'bg-canvas-100 text-ink-600 border-ink-100',
  neutral: 'bg-canvas-100 text-ink-600 border-ink-100',
};

const VARIANT_ICON: Partial<Record<BadgeVariant, string>> = {
  verified: '✓',
  developing: '◐',
  unverified: '·',
  quarantined: '⚑',
  blocked: '■',
  disputed: '!',
  new: '●',
};

export function Badge({
  variant = 'neutral',
  children,
  title,
  className = '',
  withIcon = true,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  title?: string;
  className?: string;
  withIcon?: boolean;
}) {
  const icon = withIcon ? VARIANT_ICON[variant] : undefined;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${VARIANT_STYLES[variant]} ${className}`}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
