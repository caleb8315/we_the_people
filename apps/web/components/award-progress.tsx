'use client';

import { useEffect } from 'react';
import { applyXpAction, type XpAction } from '@/lib/gamification';

/**
 * Fire-and-forget XP award on mount. Drop into signal pages / verify results
 * so progress advances without wrapping every interaction.
 */
export function AwardProgress({
  action,
  disputed = false,
}: {
  action: XpAction;
  disputed?: boolean;
}) {
  useEffect(() => {
    applyXpAction(action, { disputed });
    // Award once per mount for this action key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, disputed]);

  return null;
}
