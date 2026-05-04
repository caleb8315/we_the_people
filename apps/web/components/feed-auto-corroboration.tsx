'use client';

import { useEffect, useMemo, useRef } from 'react';

interface FeedAutoCorroborationProps {
  signalIds: string[];
}

/**
 * Background corroboration trigger for top thin-coverage feed stories.
 * Uses the same /api/signal/:id/develop endpoint as the manual button.
 */
export function FeedAutoCorroboration({ signalIds }: FeedAutoCorroborationProps) {
  const startedRef = useRef(false);

  const candidateIds = useMemo(
    () => signalIds.filter((id) => typeof id === 'string' && id.length > 0),
    [signalIds],
  );

  useEffect(() => {
    if (startedRef.current || candidateIds.length === 0) return;
    startedRef.current = true;

    let cancelled = false;
    const run = async () => {
      for (const id of candidateIds) {
        if (cancelled) return;
        try {
          await fetch(`/api/signal/${id}/develop`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
            keepalive: true,
          });
        } catch {
          // Best-effort only; feed rendering should not fail on background enrichment.
        }
        if (cancelled) return;
        await wait(6500);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [candidateIds]);

  return null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
