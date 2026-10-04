'use client';

import { useState } from 'react';
import { Segmented } from '@/components/ui/segmented';
import { InvestigateClient } from '@/components/investigation/investigate-client';
import { VerifyClient } from './verify-client';

type Mode = 'deep' | 'quick';

export function VerifyWorkspace({ signedIn, deepAvailable }: { signedIn: boolean; deepAvailable: boolean }) {
  const [mode, setMode] = useState<Mode>(deepAvailable ? 'deep' : 'quick');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Verification mode"
          active={mode}
          onSelect={(v) => setMode(v as Mode)}
          options={[
            { label: 'Deep investigation', value: 'deep' },
            { label: 'Quick check', value: 'quick' },
          ]}
        />
        <p className="text-xs text-ink-400">
          {mode === 'deep'
            ? 'AI investigator: global news in local languages, full-text reading, satellites & sensors, origin tracing.'
            : 'Instant cross-check against tracked events, wires and sensor feeds. No AI.'}
        </p>
      </div>
      {mode === 'deep' && !deepAvailable && (
        <p className="rounded-2xl border border-warn-200 bg-warn-50 px-4 py-3 text-sm text-ink-700">
          Deep investigation needs an AI key on the server (AI_GATEWAY_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY). Quick check works without one.
        </p>
      )}
      {mode === 'deep' ? <InvestigateClient signedIn={signedIn} /> : <VerifyClient signedIn={signedIn} />}
    </div>
  );
}
