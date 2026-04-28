'use client';

import { siteConfig } from '@/lib/site-config';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-danger-600">
            Unexpected application error
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Crosscheck hit a problem loading this page.
          </h1>
          <p className="mt-3 text-sm text-ink-500">
            Try again in a moment. If the issue persists, include the page URL and the error digest
            when you contact support.
          </p>
          {error.digest && (
            <p className="mt-2 text-xs font-mono text-ink-400">Digest: {error.digest}</p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-700"
            >
              Try again
            </button>
            <a
              href="/feed"
              className="rounded-full border border-ink-100 bg-paper px-4 py-2 text-sm font-medium text-ink hover:border-ink-200"
            >
              Go to feed
            </a>
            <a
              href={`mailto:${siteConfig.supportEmail}`}
              className="rounded-full border border-ink-100 bg-paper px-4 py-2 text-sm font-medium text-ink hover:border-ink-200"
            >
              Contact support
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
