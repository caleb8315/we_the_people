'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { siteConfig } from '@/lib/site-config';

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-card border border-ink-100 bg-paper p-6 shadow-card">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
          Something went wrong
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">We hit an unexpected error.</h1>
        <p className="text-sm text-ink-500">
          The page failed to render correctly. You can retry, go back to the feed, or email support if
          the problem keeps happening.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-700"
        >
          Try again
        </button>
        <Link
          href="/feed"
          className="rounded-full border border-ink-100 bg-canvas-50 px-4 py-2 text-sm font-medium text-ink hover:bg-ink-100"
        >
          Open feed
        </Link>
        <a
          href={`mailto:${siteConfig.supportEmail}`}
          className="rounded-full border border-ink-100 bg-canvas-50 px-4 py-2 text-sm font-medium text-ink hover:bg-ink-100"
        >
          Contact support
        </a>
      </div>

      {error.digest && (
        <p className="text-xs text-ink-400">
          Error reference: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
