import Link from 'next/link';
import React from 'react';

export function EmptyState({
  title,
  body,
  action,
  icon = '•',
}: {
  title: string;
  body?: React.ReactNode;
  action?: { label: string; href: string };
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] p-8 text-center">
      <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-lg text-white/60" aria-hidden="true">
        {icon}
      </div>
      <p className="text-sm font-semibold text-white">{title}</p>
      {body && <div className="mt-2 text-sm text-white/60">{body}</div>}
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
