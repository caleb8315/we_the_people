import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';
import { env } from '../lib/env';
import { consumeUserDailyLimit } from '../lib/daily-limits';

/**
 * Sends user-specific daily briefing emails.
 * - Uses preferences.email_briefings + user topics.
 * - Guarantees per-user isolation by generating each payload independently.
 */
export async function runEmailBriefings(): Promise<{ sent: number; failed: number }> {
  const runId = await startEngineRun('brief');
  const sb = supabase();
  const e = env();

  if (!e.RESEND_API_KEY || !e.BRIEFING_FROM_EMAIL) {
    await finishEngineRun(runId, {
      status: 'partial',
      errors: ['RESEND_API_KEY or BRIEFING_FROM_EMAIL missing'],
    });
    return { sent: 0, failed: 0 };
  }

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

  const [{ data: prefsRows }, usersRes] = await Promise.all([
    sb
      .from('preferences')
      .select(
        'user_id, topics, email_briefings, weather_lat, weather_lon, weather_label, briefing_frequency_preference',
      )
      .eq('email_briefings', true),
    sb.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const usersById = new Map<string, string>();
  for (const u of usersRes.data?.users ?? []) {
    if (u.email) usersById.set(u.id, u.email);
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const pref of prefsRows ?? []) {
    const freq = String(pref.briefing_frequency_preference ?? 'daily');
    if (!(freq === 'daily' || freq === 'both')) continue;
    const email = usersById.get(pref.user_id);
    if (!email) continue;

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
        email,
        status: 'skipped',
        error: `daily briefing cap reached (${dailyCap.limit})`,
      });
      continue;
    }

    const { data: signals } = await sb
      .from('signals')
      .select('title, topic, severity, verification_status, url')
      .in('verification_status', ['verified', 'developing'])
      .in('topic', pref.topics ?? ['war', 'economy', 'climate'])
      .order('severity', { ascending: false })
      .limit(6);

    const weather = await fetchUserWeather(pref.weather_lat, pref.weather_lon, pref.weather_label);

    const html = buildUserBriefingHtml({
      headline: latest.headline,
      body: latest.body_markdown,
      focusTopics: pref.topics ?? [],
      signals: signals ?? [],
      weather,
    });

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${e.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: e.BRIEFING_FROM_EMAIL,
        to: [email],
        subject: `Daily OSINT Briefing · ${latest.headline}`,
        html,
      }),
    });

    if (!r.ok) {
      const msg = `email ${email}: ${await r.text()}`;
      failed++;
      errors.push(msg.slice(0, 400));
      await sb.from('briefing_deliveries').insert({
        briefing_id: latest.id,
        user_id: pref.user_id,
        email,
        status: 'failed',
        error: msg.slice(0, 500),
      });
      continue;
    }

    sent++;
    await sb.from('briefing_deliveries').insert({
      briefing_id: latest.id,
      user_id: pref.user_id,
      email,
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

function buildUserBriefingHtml(input: {
  headline: string;
  body: string;
  focusTopics: string[];
  signals: Array<{ title: string; topic: string; severity: number; verification_status: string; url?: string | null }>;
  weather?: string | null;
}) {
  const focus = input.focusTopics.length ? input.focusTopics.join(', ') : 'global';
  const cards = input.signals
    .map(
      (s) =>
        `<li><strong>[${escapeHtml(String(s.topic ?? 'other'))}]</strong> ${escapeHtml(s.title)} ` +
        `(sev ${s.severity}, ${escapeHtml(s.verification_status)})` +
        (s.url ? ` — <a href="${escapeHtml(String(s.url))}">source</a>` : '') +
        `</li>`,
    )
    .join('');

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111">
      <h2>${escapeHtml(input.headline)}</h2>
      <p><strong>Your focus topics:</strong> ${escapeHtml(focus)}</p>
      ${input.weather ? `<p><strong>Local weather signal:</strong> ${escapeHtml(input.weather)}</p>` : ''}
      <p>${escapeHtml(input.body).slice(0, 2200).replace(/\n/g, '<br/>')}</p>
      <h3>Top signals for your profile</h3>
      <ul>${cards || '<li>No high-priority signals matched your current topics today.</li>'}</ul>
      <p style="color:#666;font-size:12px">This briefing is generated per account; your preferences and AI state are isolated.</p>
    </div>
  `;
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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
