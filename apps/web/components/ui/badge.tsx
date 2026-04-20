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
  verified: 'bg-brand-500/15 text-brand-300 border-brand-500/30',
  developing: 'bg-warn-500/15 text-warn-400 border-warn-500/30',
  unverified: 'bg-white/5 text-white/60 border-white/10',
  quarantined: 'bg-danger-500/10 text-danger-400 border-danger-500/20',
  blocked: 'bg-danger-500/20 text-danger-400 border-danger-500/30',
  disputed: 'bg-danger-500/15 text-danger-400 border-danger-500/35',
  new: 'bg-brand-500/15 text-brand-300 border-brand-500/35',
  muted: 'bg-white/5 text-white/50 border-white/10',
  topic: 'bg-white/5 text-white/75 border-white/10',
  country: 'bg-white/5 text-white/70 border-white/10',
  neutral: 'bg-white/5 text-white/70 border-white/10',
};

// Badge variant keys mirror the internal reliability enum for styling, but
// the labels shown to users come from `statusLabel()` in `@osint/core`.
// Keep icons neutral: a check here means "corroborated", not "true".
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
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${VARIANT_STYLES[variant]} ${className}`}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
