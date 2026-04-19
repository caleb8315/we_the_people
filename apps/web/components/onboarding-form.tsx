'use client';

import { useState } from 'react';

const TOPICS = ['war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster', 'other'] as const;
type Topic = (typeof TOPICS)[number];

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [displayName, setDisplayName] = useState(defaultName);
  const [topics, setTopics] = useState<Topic[]>(['war', 'economy', 'climate']);
  const [feedMode, setFeedMode] = useState<'personalized' | 'global' | 'hybrid'>('personalized');
  const [briefingFrequency, setBriefingFrequency] = useState<'daily' | 'weekly' | 'both' | 'off'>('daily');
  const [alertIntensity, setAlertIntensity] = useState<'critical_only' | 'important_and_up' | 'all'>(
    'critical_only',
  );
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
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm text-white/70">
        Display name
        <input
          type="text"
          required
          minLength={2}
          maxLength={40}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/40"
          placeholder="Analyst Zero"
        />
      </label>

      <div>
        <h2 className="text-sm text-white/70">Choose your focus topics</h2>
        <div className="mt-2 flex flex-wrap gap-2">
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
                className={`rounded border px-3 py-1.5 text-sm capitalize ${
                  selected
                    ? 'border-white/40 bg-white/10 text-white'
                    : 'border-white/10 text-white/60 hover:border-white/30'
                }`}
              >
                {topic}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm text-white/70">Personalization defaults</h2>
        <label className="block text-sm text-white/70">
          Feed mode
          <select
            value={feedMode}
            onChange={(e) => setFeedMode(e.target.value as 'personalized' | 'global' | 'hybrid')}
            className="mt-1 w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          >
            <option value="personalized">Personalized first</option>
            <option value="global">Global first</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </label>
        <label className="block text-sm text-white/70">
          Briefing frequency
          <select
            value={briefingFrequency}
            onChange={(e) => setBriefingFrequency(e.target.value as 'daily' | 'weekly' | 'both' | 'off')}
            className="mt-1 w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          >
            <option value="daily">Daily (recommended)</option>
            <option value="weekly">Weekly</option>
            <option value="both">Daily + weekly</option>
            <option value="off">Off</option>
          </select>
        </label>
        <label className="block text-sm text-white/70">
          Alert intensity
          <select
            value={alertIntensity}
            onChange={(e) => setAlertIntensity(e.target.value as 'critical_only' | 'important_and_up' | 'all')}
            className="mt-1 w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          >
            <option value="critical_only">Critical only</option>
            <option value="important_and_up">Important and up</option>
            <option value="all">All priority candidates</option>
          </select>
        </label>
        <label className="block text-sm text-white/70">
          Max alert emails/day ({maxAlertsPerDay})
          <input
            type="range"
            min={1}
            max={5}
            value={maxAlertsPerDay}
            onChange={(e) => setMaxAlertsPerDay(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
        <p className="text-xs text-white/50">
          Beta defaults are tuned for signal, not noise: personalized feed, daily briefing, critical-first alerts.
        </p>
      </div>

      <button
        type="submit"
        disabled={saving || topics.length === 0 || !displayName.trim()}
        className="w-full rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-60"
      >
        {saving ? 'Finishing…' : 'Enter dashboard'}
      </button>

      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}
