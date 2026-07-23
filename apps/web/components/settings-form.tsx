'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Segmented } from './ui/segmented';
import { siteConfig } from '@/lib/site-config';

const TOPICS = ['war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster', 'tech', 'finance', 'other'] as const;
type Topic = (typeof TOPICS)[number];

export interface PrefsInitial {
  topics?: Topic[];
  muted_sources?: string[];
  muted_topics?: Topic[];
  countries_of_focus?: string[];
  notifications_enabled?: boolean;
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

const SETTINGS_TABS = [
  { id: 'topics', label: 'Topics', icon: TopicsIcon },
  { id: 'sources', label: 'Sources', icon: SourcesIcon },
  { id: 'delivery', label: 'Delivery', icon: DeliveryIcon },
  { id: 'account', label: 'Account', icon: AccountIcon },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

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
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    initial?.notifications_enabled ?? true,
  );
  const [alerts, setAlerts] = useState<boolean>(initial?.alerts_enabled ?? true);
  const [minSev, setMinSev] = useState<number>(initial?.min_alert_severity ?? 70);
  const [weatherLabel, setWeatherLabel] = useState<string>(initial?.weather_label ?? '');
  const [weatherLat, setWeatherLat] = useState<string>(
    initial?.weather_lat != null ? String(initial.weather_lat) : '',
  );
  const [weatherLon, setWeatherLon] = useState<string>(
    initial?.weather_lon != null ? String(initial.weather_lon) : '',
  );
  const [feedMode, setFeedMode] = useState<'personalized' | 'global'>(
    initial?.feed_mode_preference === 'global' ? 'global' : 'personalized',
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
  const [exporting, setExporting] = useState(false);
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
      notifications_enabled: notificationsEnabled,
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

  async function exportAccount() {
    setAccountStatus('Preparing your account export…');
    setExporting(true);
    try {
      const res = await fetch('/api/account/export', { method: 'GET' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setAccountStatus(body?.error ?? 'Could not export account data. Try again later.');
        return;
      }

      const disposition = res.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'crosscheck-account-export.json';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setAccountStatus('Account export downloaded.');
    } catch {
      setAccountStatus('Could not reach the server. Try again.');
    } finally {
      setExporting(false);
    }
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

  const [activeTab, setActiveTab] = useState<SettingsTab>('topics');

  return (
    <div className="pb-28">
      {/* Tab navigation */}
      <div className="mb-6">
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {SETTINGS_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-ink-900 text-white shadow-sm'
                    : 'text-ink-500 hover:bg-ink-100 hover:text-ink'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-ink-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Topics tab */}
      {activeTab === 'topics' && (
        <div className="space-y-6">
          <SettingsCard
            title="Topics I care about"
            description="Select topics to personalize your feed and briefings."
          >
            <ChipGroup
              options={[...TOPICS]}
              selected={topics}
              onToggle={(t) =>
                setTopics((xs) => (xs.includes(t as Topic) ? xs.filter((x) => x !== t) : [...xs, t as Topic]))
              }
            />
          </SettingsCard>

          <SettingsCard
            title="Muted topics"
            description="These topics will be suppressed from your feed."
          >
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
          </SettingsCard>

          <SettingsCard
            title="Countries of focus"
            description="ISO 2-letter codes, comma-separated. Signals from these countries are prioritized."
          >
            <input
              className="w-full rounded-lg border border-ink-100 bg-canvas-50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
              value={countries}
              onChange={(e) => setCountries(e.target.value)}
              placeholder="US, UA, RU, IL"
            />
          </SettingsCard>

          <SettingsCard
            title="Weather location"
            description="Set your location for weather and environmental signals."
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                className="rounded-lg border border-ink-100 bg-canvas-50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                value={weatherLabel}
                onChange={(e) => setWeatherLabel(e.target.value)}
                placeholder="Denver, CO or 80202"
              />
              <button
                type="button"
                onClick={geocodeNow}
                disabled={geocoding || !weatherLabel.trim()}
                className="rounded-lg border border-ink-100 bg-paper px-4 py-2.5 text-sm font-medium text-ink-600 transition hover:bg-ink-100 disabled:opacity-60"
              >
                {geocoding ? 'Resolving…' : 'Auto-resolve'}
              </button>
            </div>
            {weatherLat && weatherLon && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3" /><path d="M12 2a8 8 0 0 0-8 8c0 5 8 12 8 12s8-7 8-12a8 8 0 0 0-8-8z" /></svg>
                Coordinates: {weatherLat}, {weatherLon}
              </p>
            )}
          </SettingsCard>
        </div>
      )}

      {/* Sources tab */}
      {activeTab === 'sources' && (
        <div className="space-y-6">
          <SettingsCard
            title="Muted sources"
            description="Muted sources are excluded from your personalized feed and briefings. Tap to toggle."
          >
            <div className="space-y-5">
              {SOURCE_GROUP_ORDER.filter((k) => groupedSources.has(k)).map((group) => (
                <div key={group}>
                  <p className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                    <span className="h-px flex-1 bg-ink-100" />
                    {SOURCE_GROUP_LABELS[group]}
                    <span className="h-px flex-1 bg-ink-100" />
                  </p>
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                            className={`w-full rounded-lg border px-3.5 py-2.5 text-left text-sm transition ${
                              isMuted
                                ? 'border-danger-200 bg-danger-50 text-danger-600'
                                : 'border-ink-100 bg-paper hover:bg-canvas-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium clamp-1">{s.name}</span>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                isMuted
                                  ? 'bg-danger-100 text-danger-700'
                                  : 'bg-canvas-50 text-ink-500'
                              }`}>
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
          </SettingsCard>
        </div>
      )}

      {/* Delivery tab */}
      {activeTab === 'delivery' && (
        <div className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <SettingsCard
              title="Feed mode"
              description="Choose your default feed view. You can switch instantly in the feed."
            >
              <Segmented
                active={feedMode}
                onSelect={(v) => setFeedMode(v as 'personalized' | 'global')}
                options={[
                  { label: 'Personalized', value: 'personalized' },
                  { label: 'Global', value: 'global' },
                ]}
              />
            </SettingsCard>

            <SettingsCard
              title="Briefing frequency"
              description="Daily is recommended to stay informed without noise."
            >
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
            </SettingsCard>
          </div>

          <SettingsCard
            title="Notifications & alerts"
            description="Control how and when you receive updates."
          >
            <div className="space-y-5">
              <div className="flex flex-wrap gap-4">
                <ToggleSwitch
                  label="In-app notifications"
                  checked={notificationsEnabled}
                  onChange={setNotificationsEnabled}
                />
                <ToggleSwitch
                  label="Priority alerts"
                  checked={alerts}
                  onChange={setAlerts}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={`Minimum alert severity: ${minSev}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-400">40</span>
                    <input
                      type="range"
                      min={40}
                      max={95}
                      value={minSev}
                      onChange={(e) => setMinSev(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                    <span className="text-xs text-ink-400">95</span>
                  </div>
                </Field>

                <Field label={`Max alerts per day: ${maxAlertsPerDay}`} hint="Platform cap is 5/day.">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-400">1</span>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={maxAlertsPerDay}
                      onChange={(e) => setMaxAlertsPerDay(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                    <span className="text-xs text-ink-400">5</span>
                  </div>
                </Field>
              </div>

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
            </div>
          </SettingsCard>

          <SettingsCard
            title="Trust & methodology"
            description="Understand how Crosscheck scores and classifies information."
          >
            <a
              href="/trust"
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 transition hover:text-brand-800"
            >
              Open trust documentation
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 5 7 7-7 7" /></svg>
            </a>
          </SettingsCard>
        </div>
      )}

      {/* Account tab */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          <SettingsCard
            title="Profile"
            description="Update your display name and credentials."
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-ink-100 bg-canvas-50 px-4 py-3">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-ink-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                <span className="text-sm font-mono text-ink-600">{account.email}</span>
              </div>

              <Field label="Display name">
                <input
                  className="w-full rounded-lg border border-ink-100 bg-canvas-50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Analyst Zero"
                />
              </Field>

              <Field label="New password (optional)">
                <input
                  type="password"
                  minLength={8}
                  className="w-full rounded-lg border border-ink-100 bg-canvas-50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                />
              </Field>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={saveAccount}
                  className="rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-700"
                >
                  Save profile
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-danger-200 px-4 py-2.5 text-sm font-medium text-danger-600 transition hover:bg-danger-50"
                >
                  Sign out
                </button>
              </div>
              {accountStatus && (
                <p className="rounded-lg border border-ink-100 bg-canvas-50 px-4 py-2.5 text-sm text-ink-600">
                  {accountStatus}
                </p>
              )}
            </div>
          </SettingsCard>

          <SettingsCard
            title="Data & privacy"
            description="Export or delete your account data."
          >
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={exportAccount}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-lg border border-ink-100 bg-paper px-4 py-2.5 text-sm font-medium text-ink-600 transition hover:bg-ink-100 disabled:opacity-60"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                {exporting ? 'Preparing export…' : 'Export my data'}
              </button>
            </div>
          </SettingsCard>

          <div className="rounded-card border border-danger-200 bg-danger-50/40 p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-100 text-danger-700">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-danger-700">Danger zone</h3>
                <p className="mt-1 text-sm text-ink-600">
                  Permanently delete your profile, preferences, saved views, feedback, and AI chat history. This cannot be undone.
                </p>
                <p className="mt-2 text-xs text-ink-500">
                  Need help? Contact <a className="underline" href={`mailto:${siteConfig.privacyEmail}`}>{siteConfig.privacyEmail}</a>.
                </p>
                <button
                  type="button"
                  onClick={deleteAccount}
                  className="mt-3 rounded-lg border border-danger-300 bg-white px-4 py-2 text-sm font-medium text-danger-700 transition hover:bg-danger-100"
                >
                  Delete my account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-[72px] z-30 border-t border-ink-100 bg-ink-900/95 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <p className="text-xs text-ink-300">
            {status ? (
              <span className={status === 'Saved.' ? 'text-emerald-400' : 'text-amber-400'}>{status}</span>
            ) : (
              'Changes are saved to your account only.'
            )}
          </p>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-white px-5 py-2 text-sm font-medium text-ink-900 shadow-sm transition hover:bg-white/90 disabled:opacity-60"
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

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-3"
    >
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? 'bg-amber-500' : 'bg-ink-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-1'
          }`}
        />
      </span>
      <span className="text-sm text-ink-700 group-hover:text-ink">{label}</span>
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm text-ink-600">
      <span className="mb-1.5 inline-block text-xs font-medium uppercase tracking-wide text-ink-500">{label}</span>
      {children}
      {hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>}
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
              ? 'border-danger-200 bg-danger-50 text-danger-600 shadow-sm'
              : 'border-ink-100 text-ink-600 hover:border-ink-200 hover:text-ink'
            : on
              ? 'border-brand-200 bg-brand-50 text-brand-700 shadow-sm'
              : 'border-ink-100 text-ink-600 hover:border-ink-200 hover:text-ink';
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            className={`rounded-full border px-3.5 py-1.5 text-sm capitalize transition ${activeClass}`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function TopicsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

function SourcesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
  );
}

function DeliveryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </svg>
  );
}

function AccountIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
