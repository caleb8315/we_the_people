'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Segmented } from './ui/segmented';

const TOPICS = ['war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster', 'tech', 'finance', 'other'] as const;
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
  feed_mode_preference?: 'personalized' | 'global' | 'hybrid';
  briefing_frequency_preference?: 'daily' | 'weekly' | 'both' | 'off';
  alert_intensity_preference?: 'critical_only' | 'important_and_up' | 'all';
  max_alerts_per_day_preference?: number;
}

export interface SourceOpt {
  id: string;
  name: string;
  kind: string;
  credibility: number;
  metadata?: { type?: string | null } | null;
}

const SOURCE_GROUP_ORDER = [
  'news_wires',
  'regional_news',
  'science_sensors',
  'satellite_space',
  'weather',
  'humanitarian_official',
  'markets',
  'cyber',
  'events',
  'apis',
] as const;

const SOURCE_GROUP_LABELS: Record<(typeof SOURCE_GROUP_ORDER)[number], string> = {
  news_wires: 'News wires',
  regional_news: 'Regional news coverage',
  science_sensors: 'Science sensors',
  satellite_space: 'Satellite and space-weather intelligence',
  weather: 'Weather and alerts',
  humanitarian_official: 'Humanitarian and official bulletins',
  markets: 'Markets and macro',
  cyber: 'Cyber intelligence',
  events: 'Global events',
  apis: 'Other APIs',
};

function sourceGroupKey(source: SourceOpt): (typeof SOURCE_GROUP_ORDER)[number] {
  const kind = String(source.kind ?? '').toLowerCase();
  const type = String(source.metadata?.type ?? '').toLowerCase();
  if (type === 'earthquake' || type === 'natural_events' || type === 'volcano' || type === 'hurricane')
    return 'science_sensors';
  if (type === 'satellite' || type === 'space_weather') return 'satellite_space';
  if (type === 'weather' || type === 'weather_alerts') return 'weather';
  if (type === 'markets') return 'markets';
  if (type === 'cyber' || type === 'cyber_intel') return 'cyber';
  if (type === 'humanitarian' || type === 'official_bulletin') return 'humanitarian_official';
  if (type === 'news_regional') return 'regional_news';
  if (type === 'events') return 'events';
  return kind === 'rss' ? 'news_wires' : 'apis';
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
  const [weatherLat, setWeatherLat] = useState<string>(
    initial?.weather_lat != null ? String(initial.weather_lat) : '',
  );
  const [weatherLon, setWeatherLon] = useState<string>(
    initial?.weather_lon != null ? String(initial.weather_lon) : '',
  );
  const [feedMode, setFeedMode] = useState<'personalized' | 'global' | 'hybrid'>(
    initial?.feed_mode_preference ?? 'personalized',
  );
  const [briefingFrequency, setBriefingFrequency] = useState<'daily' | 'weekly' | 'both' | 'off'>(
    initial?.briefing_frequency_preference ?? 'daily',
  );
  const [alertIntensity, setAlertIntensity] = useState<'critical_only' | 'important_and_up' | 'all'>(
    initial?.alert_intensity_preference ?? 'critical_only',
  );
  const [maxAlertsPerDay, setMaxAlertsPerDay] = useState<number>(
    initial?.max_alerts_per_day_preference ?? 3,
  );
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(account.display_name ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const groupedSources = new Map<(typeof SOURCE_GROUP_ORDER)[number], SourceOpt[]>();
  for (const source of sources) {
    const key = sourceGroupKey(source);
    if (!groupedSources.has(key)) groupedSources.set(key, []);
    groupedSources.get(key)!.push(source);
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    let weatherLatValue = weatherLat.trim();
    let weatherLonValue = weatherLon.trim();
    let weatherLabelValue = weatherLabel.trim();

    if (weatherLabelValue && (!weatherLatValue || !weatherLonValue)) {
      const geo = await geocodeLocation(weatherLabelValue);
      if (geo) {
        weatherLatValue = String(geo.lat);
        weatherLonValue = String(geo.lon);
        weatherLabelValue = geo.label || weatherLabelValue;
        setWeatherLat(weatherLatValue);
        setWeatherLon(weatherLonValue);
        setWeatherLabel(weatherLabelValue);
      }
    }

    const payload: Record<string, unknown> = {
      topics,
      muted_sources: mutedSources,
      muted_topics: mutedTopics,
      countries_of_focus: countries
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length === 2),
      email_briefings: email,
      alerts_enabled: alerts,
      min_alert_severity: minSev,
      feed_mode_preference: feedMode,
      briefing_frequency_preference: briefingFrequency,
      alert_intensity_preference: alertIntensity,
      max_alerts_per_day_preference: Math.max(1, Math.min(5, maxAlertsPerDay)),
    };

    if (weatherLabelValue) payload.weather_label = weatherLabelValue;
    if (weatherLatValue) payload.weather_lat = Number(weatherLatValue);
    if (weatherLonValue) payload.weather_lon = Number(weatherLonValue);

    const res = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    setStatus(res.ok ? 'Saved.' : 'Save failed — please retry.');
    if (res.ok) router.refresh();
  }

  async function geocodeNow() {
    const query = weatherLabel.trim();
    if (!query) {
      setStatus('Enter a city/state/ZIP first.');
      return;
    }
    setGeocoding(true);
    setStatus(null);
    const geo = await geocodeLocation(query);
    setGeocoding(false);
    if (!geo) {
      setStatus('Could not resolve location. Try city + state, e.g. "Denver, CO".');
      return;
    }
    setWeatherLabel(geo.label || query);
    setWeatherLat(String(geo.lat));
    setWeatherLon(String(geo.lon));
    setStatus('Location resolved.');
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

  async function deleteAccount() {
    const confirmed = window.confirm(
      'Delete your Crosscheck account? This removes your profile, preferences, saved views, feedback, and AI chat history. It cannot be undone.',
    );
    if (!confirmed) return;
    setAccountStatus('Deleting account…');
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setAccountStatus(body?.error ?? 'Could not delete account. Try again later or contact support.');
        return;
      }
      window.location.href = '/?deleted=1';
    } catch {
      setAccountStatus('Could not reach the server. Try again.');
    }
  }

  return (
    <div className="space-y-8 pb-28">
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
            setMutedTopics((xs) =>
              xs.includes(t as Topic) ? xs.filter((x) => x !== t) : [...xs, t as Topic],
            )
          }
          tone="danger"
        />
      </Section>

      <Section title="Countries of focus (ISO 2-letter, comma-separated)">
        <input
          className="w-full rounded-md border border-ink-100 bg-canvas-50 px-3 py-2 text-sm outline-none focus:border-brand-300"
          value={countries}
          onChange={(e) => setCountries(e.target.value)}
          placeholder="US, UA, RU, IL"
        />
      </Section>

      <Section title="Muted sources">
        <div className="space-y-4">
          {SOURCE_GROUP_ORDER.filter((k) => groupedSources.has(k)).map((group) => (
            <div key={group}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                {SOURCE_GROUP_LABELS[group]}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {groupedSources.get(group)!.map((s) => {
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
                        className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                          isMuted
                            ? 'border-danger-200 bg-danger-50 text-danger-600'
                            : 'border-ink-100 bg-paper hover:bg-canvas-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium clamp-1">{s.name}</span>
                          <span className="text-[11px] text-ink-500">
                            {isMuted ? 'muted' : `cred ${s.credibility}`}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Delivery defaults">
        <div className="space-y-4">
          <Field label="Feed mode default" hint="You can still switch instantly between My Feed and Global Feed.">
            <Segmented
              active={feedMode}
              onSelect={(v) => setFeedMode(v as 'personalized' | 'global' | 'hybrid')}
              options={[
                { label: 'Personalized', value: 'personalized' },
                { label: 'Global', value: 'global' },
                { label: 'Hybrid', value: 'hybrid' },
              ]}
            />
          </Field>

          <Field label="Briefing frequency" hint="Daily (1/day) is recommended to stay useful without spam.">
            <Segmented
              active={briefingFrequency}
              onSelect={(v) => setBriefingFrequency(v as 'daily' | 'weekly' | 'both' | 'off')}
              options={[
                { label: 'Daily', value: 'daily' },
                { label: 'Weekly', value: 'weekly' },
                { label: 'Both', value: 'both' },
                { label: 'Off', value: 'off' },
              ]}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
              Daily email briefing
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} />
              Priority alerts
            </label>
          </div>

          <Field label={`Minimum alert severity (${minSev})`}>
            <input
              type="range"
              min={40}
              max={95}
              value={minSev}
              onChange={(e) => setMinSev(Number(e.target.value))}
              className="w-full"
            />
          </Field>

          <Field label="Alert intensity">
            <Segmented
              active={alertIntensity}
              onSelect={(v) => setAlertIntensity(v as 'critical_only' | 'important_and_up' | 'all')}
              options={[
                { label: 'Critical only', value: 'critical_only' },
                { label: 'Important+', value: 'important_and_up' },
                { label: 'All', value: 'all' },
              ]}
            />
          </Field>

          <Field label={`Max alert emails per day (${maxAlertsPerDay})`} hint="Platform cap is 5/day.">
            <input
              type="range"
              min={1}
              max={5}
              value={maxAlertsPerDay}
              onChange={(e) => setMaxAlertsPerDay(Number(e.target.value))}
              className="w-full"
            />
          </Field>
        </div>
      </Section>

      <Section title="Weather location">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            className="rounded-md border border-ink-100 bg-canvas-50 px-3 py-2 text-sm outline-none focus:border-brand-300"
            value={weatherLabel}
            onChange={(e) => setWeatherLabel(e.target.value)}
            placeholder="Denver, CO or 80202"
          />
          <button
            type="button"
            onClick={geocodeNow}
            disabled={geocoding || !weatherLabel.trim()}
            className="rounded-full border border-ink-100 px-3 py-2 text-sm hover:bg-ink-100 disabled:opacity-60"
          >
            {geocoding ? 'Resolving…' : 'Auto-resolve'}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          We convert this to coordinates automatically for weather signals.
          {weatherLat && weatherLon ? ` Current: ${weatherLat}, ${weatherLon}` : ''}
        </p>
      </Section>

      <Section title="Account">
        <div className="space-y-3 rounded-card border border-ink-100 bg-paper p-4">
          <p className="text-sm text-ink-600">
            Email: <span className="font-mono text-ink-700">{account.email}</span>
          </p>
          <Field label="Display name">
            <input
              className="w-full rounded-md border border-ink-100 bg-canvas-50 px-3 py-2 text-sm outline-none focus:border-brand-300"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Analyst Zero"
            />
          </Field>
          <Field label="New password (optional)">
            <input
              type="password"
              minLength={8}
              className="w-full rounded-md border border-ink-100 bg-canvas-50 px-3 py-2 text-sm outline-none focus:border-brand-300"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveAccount}
              className="rounded-full border border-ink-100 px-3 py-2 text-sm hover:bg-ink-100"
            >
              Save account
            </button>
            <button
              type="button"
              onClick={signOut}
              className="rounded-full border border-danger-200 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50"
            >
              Sign out
            </button>
          </div>
          {accountStatus && <p className="text-sm text-ink-600">{accountStatus}</p>}
        </div>
        <div className="rounded-card border border-danger-200 bg-danger-50/50 p-4">
          <h3 className="text-sm font-semibold text-danger-700">Delete account</h3>
          <p className="mt-1 text-sm text-ink-600">
            Removes your profile, preferences, saved views, feedback, and AI chat history.
            This cannot be undone.
          </p>
          <button
            type="button"
            onClick={deleteAccount}
            className="mt-3 rounded-full border border-danger-300 bg-white px-3 py-2 text-sm font-medium text-danger-700 hover:bg-danger-100"
          >
            Delete my account
          </button>
        </div>
      </Section>

      <Section title="Trust & methodology">
        <div className="rounded-card border border-ink-100 bg-paper p-4">
          <p className="text-sm text-ink-600">
            Reliability labels, confidence bands, source-disagreement wording, and the legal boundaries we work
            within are documented here.
          </p>
          <a href="/trust" className="mt-3 inline-block text-sm text-brand-700 underline">
            Open trust documentation
          </a>
        </div>
      </Section>

      {/* Sticky save bar — sits above the mobile bottom nav (bottom-[72px] on mobile, bottom-0 on desktop) */}
      <div className="fixed inset-x-0 bottom-[72px] z-30 border-t border-ink-100 bg-base-900/90 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <p className="text-xs text-ink-500">{status ?? 'Changes are saved to your account only.'}</p>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

async function geocodeLocation(
  query: string,
): Promise<{ label: string; lat: number; lon: number } | null> {
  try {
    const res = await fetch(`/api/location/geocode?query=${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { location?: { label: string; lat: number; lon: number } };
    return body.location ?? null;
  } catch {
    return null;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm text-ink-600">
      <span className="mb-1 inline-block text-xs font-medium uppercase tracking-wide text-ink-500">{label}</span>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </label>
  );
}

function ChipGroup({
  options,
  selected,
  onToggle,
  tone = 'neutral',
}: {
  options: string[];
  selected: string[];
  onToggle: (t: string) => void;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((t) => {
        const on = selected.includes(t);
        const activeClass =
          tone === 'danger'
            ? on
              ? 'border-danger-200 bg-danger-50 text-danger-600'
              : 'border-ink-100 text-ink-600 hover:border-ink-200 hover:text-ink'
            : on
              ? 'border-brand-200 bg-brand-50 text-brand-700'
              : 'border-ink-100 text-ink-600 hover:border-ink-200 hover:text-ink';
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            className={`rounded-full border px-3 py-1.5 text-sm capitalize transition ${activeClass}`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
