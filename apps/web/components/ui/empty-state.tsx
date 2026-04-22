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
    <div className="rounded-card border border-ink-100 bg-paper p-8 text-center shadow-card">
      <div
        className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-lg text-amber-600"
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="text-base font-semibold text-ink">{title}</p>
      {body && <div className="mt-2 text-sm text-ink-500">{body}</div>}
      {action && (
        <Link
          href={action.href}
          className="mt-5 inline-flex items-center rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-700"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
