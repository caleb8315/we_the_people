'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'crosscheck-feed-orientation-dismissed';

export function FeedOrientationBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DISMISS_KEY);
      setDismissed(saved === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // no-op
    }
  }

  if (dismissed) return null;

  return (
    <div className="mb-1 flex items-start justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
      <p className="text-sm text-blue-800">
        Each story below shows how independent sources align — and flags where they contradict
        each other. Click any story to see the full breakdown.
      </p>
      <button onClick={dismiss} className="ml-4 shrink-0 text-sm text-blue-500 hover:text-blue-700">
        Got it
      </button>
    </div>
  );
}
