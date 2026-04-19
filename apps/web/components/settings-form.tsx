'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TOPICS = ['war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster', 'other'] as const;
type Topic = (typeof TOPICS)[number];

export interface PrefsInitial {
  topics?: Topic[];
  muted_sources?: string[];
  muted_topics?: Topic[];
  countries_of_focus?: string[];
  email_briefings?: boolean;
  alerts_enabled?: boolean;
  min_alert_severity?: number;
  weather_lat?: number | null;
  weather_lon?: number | null;
  weather_label?: string | null;
}

export interface SourceOpt {
  id: string;
  name: string;
  kind: string;
  credibility: number;
}

export function SettingsForm({
  initial,
  sources,
  account,
}: {
  initial: PrefsInitial | null;
  sources: SourceOpt[];
  account: { email: string; display_name: string };
}) {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>(initial?.topics ?? ['war', 'economy', 'climate']);
  const [mutedSources, setMutedSources] = useState<string[]>(initial?.muted_sources ?? []);
  const [mutedTopics, setMutedTopics] = useState<Topic[]>(initial?.muted_topics ?? []);
  const [countries, setCountries] = useState<string>((initial?.countries_of_focus ?? []).join(', '));
  const [email, setEmail] = useState<boolean>(initial?.email_briefings ?? true);
  const [alerts, setAlerts] = useState<boolean>(initial?.alerts_enabled ?? true);
  const [minSev, setMinSev] = useState<number>(initial?.min_alert_severity ?? 70);
  const [weatherLabel, setWeatherLabel] = useState<string>(initial?.weather_label ?? '');
  const [weatherLat, setWeatherLat] = useState<string>(initial?.weather_lat != null ? String(initial.weather_lat) : '');
  const [weatherLon, setWeatherLon] = useState<string>(initial?.weather_lon != null ? String(initial.weather_lon) : '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(account.display_name ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [accountStatus, setAccountStatus] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setStatus(null);
    const res = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        topics,
        muted_sources: mutedSources,
        muted_topics: mutedTopics,
        countries_of_focus: countries
          .split(',')
          .map(s => s.trim().toUpperCase())
          .filter(s => s.length === 2),
        email_briefings: email,
        alerts_enabled: alerts,
        min_alert_severity: minSev,
        weather_label: weatherLabel.trim() || null,
        weather_lat: weatherLat.trim() ? Number(weatherLat) : null,
        weather_lon: weatherLon.trim() ? Number(weatherLon) : null,
      }),
    });
    setSaving(false);
    setStatus(res.ok ? 'Saved.' : 'Save failed — please retry.');
    if (res.ok) router.refresh();
  }

  async function saveAccount() {
    setAccountStatus(null);
    const profileRes = await fetch('/api/account/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ display_name: displayName }),
    });
    if (!profileRes.ok) {
      setAccountStatus('Could not update profile name.');
      return;
    }

    if (newPassword.trim()) {
      const passwordRes = await fetch('/api/account/password', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!passwordRes.ok) {
        setAccountStatus('Profile updated, but password change failed.');
        return;
      }
      setNewPassword('');
    }

    setAccountStatus('Account updated.');
    router.refresh();
  }

  async function signOut() {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <div className="space-y-8">
      <Section title="Topics I care about">
        <ChipGroup
          options={[...TOPICS]}
          selected={topics}
          onToggle={(t) =>
            setTopics((xs) => (xs.includes(t as Topic) ? xs.filter((x) => x !== t) : [...xs, t as Topic]))
          }
        />
      </Section>

      <Section title="Mute topics">
        <ChipGroup
          options={[...TOPICS]}
          selected={mutedTopics}
          onToggle={(t) =>
            setMutedTopics((xs) => (xs.includes(t as Topic) ? xs.filter((x) => x !== t) : [...xs, t as Topic]))
          }
        />
      </Section>

      <Section title="Countries of focus (ISO 2-letter, comma-separated)">
        <input
          className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
          value={countries}
          onChange={(e) => setCountries(e.target.value)}
          placeholder="US, UA, RU, IL"
        />
      </Section>

      <Section title="Muted sources">
        <ul className="grid gap-2 sm:grid-cols-2">
          {sources.map((s) => {
            const isMuted = mutedSources.includes(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() =>
                    setMutedSources((xs) =>
                      xs.includes(s.id) ? xs.filter((x) => x !== s.id) : [...xs, s.id],
                    )
                  }
                  className={`w-full rounded border px-3 py-2 text-left text-sm ${
                    isMuted
                      ? 'border-red-500/40 bg-red-500/10 text-red-200'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-white/50">{isMuted ? 'muted' : `cred ${s.credibility}`}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Delivery">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          Daily email briefing
        </label>
        <label className="mt-2 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} />
          Priority alerts
        </label>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <label>Minimum severity for alerts: <strong>{minSev}</strong></label>
          <input
            type="range"
            min={40}
            max={95}
            value={minSev}
            onChange={(e) => setMinSev(Number(e.target.value))}
          />
        </div>
      </Section>

      <Section title="Weather location (for local weather signals)">
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            value={weatherLabel}
            onChange={(e) => setWeatherLabel(e.target.value)}
            placeholder="City label (e.g., Austin, TX)"
          />
          <input
            className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            value={weatherLat}
            onChange={(e) => setWeatherLat(e.target.value)}
            placeholder="Latitude (e.g., 30.2672)"
          />
          <input
            className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
            value={weatherLon}
            onChange={(e) => setWeatherLon(e.target.value)}
            placeholder="Longitude (e.g., -97.7431)"
          />
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {status && <span className="text-sm text-white/70">{status}</span>}
      </div>

      <Section title="Account">
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-white/70">
            Email: <span className="font-mono text-white/90">{account.email}</span>
          </p>
          <label className="block text-sm text-white/70">
            Display name
            <input
              className="mt-1 w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Analyst Zero"
            />
          </label>
          <label className="block text-sm text-white/70">
            New password (optional)
            <input
              type="password"
              minLength={8}
              className="mt-1 w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/40"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveAccount}
              className="rounded border border-white/20 px-3 py-2 text-sm hover:bg-white/10"
            >
              Save account
            </button>
            <button
              type="button"
              onClick={signOut}
              className="rounded border border-red-500/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
            >
              Sign out
            </button>
          </div>
          {accountStatus && <p className="text-sm text-white/70">{accountStatus}</p>}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/70">{title}</h2>
      {children}
    </section>
  );
}

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (t: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((t) => {
        const on = selected.includes(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            className={`rounded border px-3 py-1 text-sm capitalize ${
              on
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-white/10 text-white/60 hover:border-white/20 hover:text-white'
            }`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
