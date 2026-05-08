import { statusLabel } from '@osint/core';
import type { VerificationStatus } from '@osint/core/types';
import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';
import { consumeUserDailyLimit } from '../lib/daily-limits';
import { createUserNotification } from '../lib/user-notifications';

/**
 * Creates user-specific daily briefing notifications.
 * - Uses preferences.notifications_enabled + user topics.
 * - Guarantees per-user isolation by generating each payload independently.
 */
export async function runUserNotifications(): Promise<{ sent: number; failed: number }> {
  const runId = await startEngineRun('brief');
  const sb = supabase();

  const { data: latest, error: latestErr } = await sb
    .from('briefings')
    .select('id, headline, body_markdown, period_start')
    .eq('kind', 'daily')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr || !latest) {
    await finishEngineRun(runId, { status: 'partial', errors: [latestErr?.message ?? 'no daily briefing'] });
    return { sent: 0, failed: 0 };
  }

  const { data: prefsRows } = await sb
    .from('preferences')
    .select(
      'user_id, topics, notifications_enabled, weather_lat, weather_lon, weather_label, briefing_frequency_preference',
    )
    .eq('notifications_enabled', true);

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const pref of prefsRows ?? []) {
    const freq = String(pref.briefing_frequency_preference ?? 'daily');
    if (!(freq === 'daily' || freq === 'both')) continue;

    const { data: existing } = await sb
      .from('briefing_deliveries')
      .select('id')
      .eq('briefing_id', latest.id)
      .eq('user_id', pref.user_id)
      .maybeSingle();
    if (existing) continue;

    const dailyCap = await consumeUserDailyLimit(sb, pref.user_id, 'daily_briefing');
    if (!dailyCap.ok) {
      await sb.from('briefing_deliveries').insert({
        briefing_id: latest.id,
        user_id: pref.user_id,
        email: null,
        status: 'skipped',
        error: `daily briefing cap reached (${dailyCap.limit})`,
      });
      continue;
    }

    const { data: signals } = await sb
      .from('signals')
      .select(
        'title, topic, severity, verification_status, url, source_count, credible_source_count, distinct_domains, last_enriched_at',
      )
      .in('verification_status', ['verified', 'developing'])
      .in('topic', pref.topics ?? ['war', 'economy', 'climate'])
      .order('severity', { ascending: false })
      .limit(6);

    const weather = await fetchUserWeather(pref.weather_lat, pref.weather_lon, pref.weather_label);

    const notificationBody = buildUserBriefingBody({
      headline: latest.headline,
      body: latest.body_markdown,
      focusTopics: pref.topics ?? [],
      signals: signals ?? [],
      weather,
    });

    const topSignals = (signals ?? []).slice(0, 3);
    const notification = await createUserNotification(sb, {
      userId: pref.user_id,
      type: 'daily_briefing',
      title: `Daily briefing · ${latest.headline.slice(0, 140)}`,
      summary:
        topSignals.length > 0
          ? topSignals.map((s) => `[${String(s.topic ?? 'other')}] ${s.title}`).join(' · ').slice(0, 560)
          : 'No high-priority signals matched your current topics today.',
      body: notificationBody,
      briefingId: latest.id,
      data: {
        briefing_id: latest.id,
        kind: 'daily',
        period_start: latest.period_start,
        signal_count: (signals ?? []).length,
      },
    });

    if (!notification.ok) {
      const msg = `notification failed: ${notification.error ?? 'unknown error'}`;
      failed++;
      errors.push(msg.slice(0, 400));
      await sb.from('briefing_deliveries').insert({
        briefing_id: latest.id,
        user_id: pref.user_id,
        email: null,
        status: 'failed',
        error: msg.slice(0, 500),
      });
      continue;
    }

    sent++;
    await sb.from('briefing_deliveries').insert({
      briefing_id: latest.id,
      user_id: pref.user_id,
      email: null,
      status: 'sent',
    });
  }

  await finishEngineRun(runId, {
    status: failed === 0 ? 'success' : sent > 0 ? 'partial' : 'failed',
    records_in: (prefsRows ?? []).length,
    records_out: sent,
    errors,
    meta: { briefing_id: latest.id, failed },
  });

  return { sent, failed };
}

function buildUserBriefingBody(input: {
  headline: string;
  body: string;
  focusTopics: string[];
  signals: Array<{
    title: string;
    topic: string;
    severity: number;
    verification_status: string;
    url?: string | null;
    source_count?: number | null;
    credible_source_count?: number | null;
    distinct_domains?: string[] | null;
    last_enriched_at?: string | null;
  }>;
  weather?: string | null;
}) {
  const focus = input.focusTopics.length ? input.focusTopics.join(', ') : 'global';
  const cards = input.signals
    .map((s) => {
      const total = s.source_count ?? 0;
      const credible = s.credible_source_count ?? 0;
      const domains = (s.distinct_domains ?? []).slice(0, 3).join(', ');
      const sourcesLine = total > 0
        ? `${total} source${total === 1 ? '' : 's'}` +
          (credible > 0 ? ` (${credible} rated outlet${credible === 1 ? '' : 's'})` : '') +
          (domains ? ` — ${domains}` : '')
        : '';
      const fresh = s.last_enriched_at
        ? '\n  Freshly corroborated — new sources surfaced in our latest live-search pass.'
        : '';
      return [
        `- [${String(s.topic ?? 'other')}] ${s.title} (sev ${s.severity}, ${statusLabel(
          s.verification_status as VerificationStatus,
        )})`,
        s.url ? `  Source: ${String(s.url)}` : null,
        sourcesLine ? `  ${sourcesLine}` : null,
        fresh ? `  ${fresh.trim()}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return [
    input.headline,
    `Your focus topics: ${focus}`,
    input.weather ? `Local weather signal: ${input.weather}` : null,
    '',
    input.body.slice(0, 2200),
    '',
    'Top signals for your profile',
    cards || '- No high-priority signals matched your current topics today.',
    '',
    'Labels summarize source coverage strength so you can judge confidence quickly while reading the linked evidence.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function fetchUserWeather(
  lat?: number | null,
  lon?: number | null,
  label?: string | null,
): Promise<string | null> {
  if (lat == null || lon == null) return null;
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        '&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto',
    );
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    const temp = j?.current?.temperature_2m;
    const wind = j?.current?.wind_speed_10m;
    if (temp == null && wind == null) return null;
    return `${label || 'Your location'}: ${temp ?? '?'}°C, wind ${wind ?? '?'} km/h`;
  } catch {
    return null;
  }
}
