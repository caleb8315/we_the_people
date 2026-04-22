'use client';

import { useState } from 'react';
import { Segmented } from './ui/segmented';

const TOPICS = ['war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster', 'other'] as const;
type Topic = (typeof TOPICS)[number];

type FeedMode = 'personalized' | 'global' | 'hybrid';
type BriefingFreq = 'daily' | 'weekly' | 'both' | 'off';
type AlertIntensity = 'critical_only' | 'important_and_up' | 'all';

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [displayName, setDisplayName] = useState(defaultName);
  const [topics, setTopics] = useState<Topic[]>(['war', 'economy', 'climate']);
  const [feedMode, setFeedMode] = useState<FeedMode>('personalized');
  const [briefingFrequency, setBriefingFrequency] = useState<BriefingFreq>('daily');
  const [alertIntensity, setAlertIntensity] = useState<AlertIntensity>('critical_only');
  const [maxAlertsPerDay, setMaxAlertsPerDay] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        display_name: displayName.trim(),
        topics,
        feed_mode_preference: feedMode,
        briefing_frequency_preference: briefingFrequency,
        alert_intensity_preference: alertIntensity,
        max_alerts_per_day_preference: Math.max(1, Math.min(5, maxAlertsPerDay)),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Could not finish onboarding.');
      return;
    }
    window.location.href = '/dashboard';
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title="Your name">
        <input
          type="text"
          required
          minLength={2}
          maxLength={40}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-md border border-ink-100 bg-canvas-50 px-3 py-2 text-ink outline-none focus:border-brand-300"
          placeholder="Analyst Zero"
        />
      </Section>

      <Section title="Focus topics" hint="Pick 1 or more. You can change these anytime.">
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((topic) => {
            const selected = topics.includes(topic);
            return (
              <button
                key={topic}
                type="button"
                onClick={() =>
                  setTopics((prev) =>
                    selected ? prev.filter((t) => t !== topic) : [...prev, topic],
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-sm capitalize transition ${
                  selected
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-ink-100 text-ink-600 hover:border-ink-200 hover:text-ink'
                }`}
              >
                {topic}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Feed default" hint="Personalized is recommended. You can always switch to global.">
        <Segmented
          active={feedMode}
          onSelect={(v) => setFeedMode(v as FeedMode)}
          options={[
            { label: 'Personalized', value: 'personalized' },
            { label: 'Global', value: 'global' },
            { label: 'Hybrid', value: 'hybrid' },
          ]}
        />
      </Section>

      <Section title="Briefing frequency" hint="Default is daily (1/day) to stay useful without spam.">
        <Segmented
          active={briefingFrequency}
          onSelect={(v) => setBriefingFrequency(v as BriefingFreq)}
          options={[
            { label: 'Daily', value: 'daily' },
            { label: 'Weekly', value: 'weekly' },
            { label: 'Both', value: 'both' },
            { label: 'Off', value: 'off' },
          ]}
        />
      </Section>

      <Section title="Alert intensity" hint="Critical-only keeps noise low. Recommended for beta.">
        <Segmented
          active={alertIntensity}
          onSelect={(v) => setAlertIntensity(v as AlertIntensity)}
          options={[
            { label: 'Critical only', value: 'critical_only' },
            { label: 'Important+', value: 'important_and_up' },
            { label: 'All', value: 'all' },
          ]}
        />
      </Section>

      <Section title={`Max alerts per day (${maxAlertsPerDay})`} hint="Platform cap is 5/day. Defaults target 1-3/day.">
        <input
          type="range"
          min={1}
          max={5}
          value={maxAlertsPerDay}
          onChange={(e) => setMaxAlertsPerDay(Number(e.target.value))}
          className="w-full"
        />
      </Section>

      <button
        type="submit"
        disabled={saving || topics.length === 0 || !displayName.trim()}
        className="w-full rounded-full bg-white px-4 py-2.5 font-medium text-black hover:bg-white/90 disabled:opacity-60"
      >
        {saving ? 'Finishing…' : 'Enter dashboard'}
      </button>

      {error && <p className="text-sm text-danger-600">{error}</p>}
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{title}</h2>
      {hint && <p className="mb-2 mt-1 text-xs text-ink-400">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}
