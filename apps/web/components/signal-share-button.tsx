'use client';

import { useState } from 'react';

export function SignalShareButton({
  title,
  verdict,
}: {
  title: string;
  verdict: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const text = `${title} — ${verdict} | Crosscheck`;
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={() => void onShare()}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-ink-100 bg-paper px-3 py-1.5 text-xs text-ink-600 hover:border-ink-200 hover:text-ink"
    >
      {copied ? 'Link copied' : 'Share this analysis'}
    </button>
  );
}
