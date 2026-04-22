import { canAlert, statusLabel } from '@osint/core/verification';
import type { VerificationStatus } from '@osint/core/types';
import { env } from '../lib/env';
import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';
import { consumeUserDailyLimit } from '../lib/daily-limits';
import { logProductEvent } from '../lib/product-events';

/**
 * Alert job — runs every N minutes.
 *
 * MVP policy: the worker sends operator/admin notifications when a
 * "priority" signal appears (severity >= 80, corroborated or developing).
 * Per-user push alerts are opt-in and delivered via email (Resend) using
 * user preferences. This file implements the operator channel; per-user
 * push is wired up with email delivery in a later phase.
 */
export async function runAlerts(): Promise<{ sent: number }> {
  const runId = await startEngineRun('alert');
  const sb = supabase();
  const e = env();

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('signals')
    .select(
      'id, title, summary, severity, verification_status, topic, country_code, url, first_seen_at, source_id, source_count, credible_source_count, distinct_domains, last_enriched_at',
    )
    .gte('first_seen_at', since)
    .gte('severity', 80)
    .order('severity', { ascending: false })
    .limit(5);

  if (error) {
    await finishEngineRun(runId, { status: 'failed', errors: [error.message] });
    return { sent: 0 };
  }

  const candidates = (data ?? []).filter(s =>
    canAlert(s.verification_status as any, 'priority'),
  );

  let sent = 0;
  let userSent = 0;
  const errors: string[] = [];

  const [{ data: prefsRows }, usersRes] = await Promise.all([
    sb
      .from('preferences')
      .select(
        'user_id, alerts_enabled, min_alert_severity, muted_sources, muted_topics, topics, alert_intensity_preference, max_alerts_per_day_preference',
      )
      .eq('alerts_enabled', true),
    sb.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const usersById = new Map<string, string>();
  for (const u of usersRes.data?.users ?? []) {
    if (u.email) usersById.set(u.id, u.email);
  }

  for (const pref of prefsRows ?? []) {
    const email = usersById.get(pref.user_id);
    if (!email) continue;
    const localDailyCap = Math.max(1, Math.min(5, Number(pref.max_alerts_per_day_preference ?? 3)));
    const intensity = String(pref.alert_intensity_preference ?? 'critical_only');
    let localSent = await countSentAlertsToday(sb, pref.user_id);

    for (const signal of candidates) {
      if (localSent >= localDailyCap) break;
      if (signal.severity < effectiveSeverityThreshold(pref.min_alert_severity ?? 70, intensity)) continue;
      const topic = String(signal.topic ?? 'other');
      const mutedTopics = new Set((pref.muted_topics ?? []) as string[]);
      if (mutedTopics.has(topic)) {
        await logProductEvent(sb, {
          userId: pref.user_id,
          eventName: 'alert_muted',
          eventProps: { reason: 'muted_topic', topic },
        });
        continue;
      }
      const focusTopics = new Set((pref.topics ?? []) as string[]);
      if (focusTopics.size > 0 && !focusTopics.has(topic)) continue;
      const mutedSources = new Set((pref.muted_sources ?? []) as string[]);
      if (signal.source_id && mutedSources.has(signal.source_id)) {
        await logProductEvent(sb, {
          userId: pref.user_id,
          eventName: 'alert_muted',
          eventProps: { reason: 'muted_source', source_id: signal.source_id },
        });
        continue;
      }

      const { data: delivered } = await sb
        .from('alert_deliveries')
        .select('id')
        .eq('signal_id', signal.id)
        .eq('user_id', pref.user_id)
        .maybeSingle();
      if (delivered) continue;

      const cap = await consumeUserDailyLimit(sb, pref.user_id, 'priority_alert');
      if (!cap.ok) {
        await sb.from('alert_deliveries').insert({
          signal_id: signal.id,
          user_id: pref.user_id,
          email,
          status: 'skipped',
          error: `priority alert cap reached (${cap.limit})`,
        });
        continue;
      }

      const ok = await sendUserAlertEmail({
        to: email,
        from: e.BRIEFING_FROM_EMAIL,
        apiKey: e.RESEND_API_KEY,
        signal,
      });
      if (!ok.ok) {
        errors.push(ok.error ?? 'unknown alert email error');
      } else {
        userSent++;
        localSent++;
        await logProductEvent(sb, {
          userId: pref.user_id,
          eventName: 'alert_sent',
          eventProps: {
            signal_id: signal.id,
            severity: signal.severity,
            topic: signal.topic ?? 'other',
            intensity,
            local_daily_cap: localDailyCap,
          },
        });
      }
      await sb.from('alert_deliveries').insert({
        signal_id: signal.id,
        user_id: pref.user_id,
        email,
        status: ok.ok ? 'sent' : 'failed',
        error: ok.ok ? null : ok.error?.slice(0, 500),
      });
    }
  }

  for (const s of candidates) {
    const reliability = statusLabel(s.verification_status as VerificationStatus);
    const credible = s.credible_source_count ?? 0;
    const total = s.source_count ?? 0;
    const sourcesPart = total > 0 ? `sources: ${credible}/${total} credible` : 'sources: corroboration pending';
    const freshPart = s.last_enriched_at ? ' · freshly corroborated' : '';
    const ok = await sendOperatorTelegram(
      [
        `🟡 PRIORITY · ${s.topic?.toUpperCase() ?? 'EVENT'}`,
        `${s.title}`,
        `severity=${s.severity} · reliability: ${reliability} · ${sourcesPart}${freshPart} · ${s.country_code ?? '—'}`,
        s.url ?? '',
      ].join('\n'),
    );
    if (ok) sent++;
  }

  await finishEngineRun(runId, {
    status: errors.length === 0 ? 'success' : 'partial',
    records_in: candidates.length,
    records_out: sent + userSent,
    errors,
    meta: { operator_sent: sent, user_sent: userSent },
  });
  console.log(`[alert] operator_sent=${sent}/${candidates.length} user_sent=${userSent}`);
  return { sent: sent + userSent };
}

async function sendOperatorTelegram(text: string): Promise<boolean> {
  const e = env();
  if (!e.TELEGRAM_BOT_TOKEN || !e.TELEGRAM_OPERATOR_CHAT_ID) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: e.TELEGRAM_OPERATOR_CHAT_ID,
        text: text.slice(0, 4090),
        disable_web_page_preview: false,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[alert] telegram failed:', (err as Error).message);
    return false;
  }
}

async function sendUserAlertEmail(input: {
  to: string;
  from?: string;
  apiKey?: string;
  signal: {
    title: string;
    summary: string | null;
    topic: string | null;
    severity: number;
    verification_status: string;
    country_code: string | null;
    url: string | null;
    source_count?: number | null;
    credible_source_count?: number | null;
    distinct_domains?: string[] | null;
    last_enriched_at?: string | null;
  };
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.from || !input.apiKey) {
    return { ok: false, error: 'email config missing (BRIEFING_FROM_EMAIL/RESEND_API_KEY)' };
  }
  const reliability = statusLabel(input.signal.verification_status as VerificationStatus);
  const credible = input.signal.credible_source_count ?? 0;
  const total = input.signal.source_count ?? 0;
  const domains = (input.signal.distinct_domains ?? []).slice(0, 3);
  const moreDomains = (input.signal.distinct_domains ?? []).length - domains.length;
  const sourcesLine =
    total > 0
      ? `${credible}/${total} credible sources` +
        (domains.length > 0
          ? ` — ${domains.map(escapeHtml).join(', ')}${moreDomains > 0 ? ` + ${moreDomains} more` : ''}`
          : '')
      : 'Sources still being corroborated';
  const freshLine = input.signal.last_enriched_at
    ? '<p style="color:#92400e;font-size:12px;margin:4px 0">Freshly corroborated — additional sources surfaced in our latest live-search pass.</p>'
    : '';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111">
      <h2>Priority alert: ${escapeHtml(input.signal.title)}</h2>
      <p><strong>Topic:</strong> ${escapeHtml(String(input.signal.topic ?? 'other'))}</p>
      <p><strong>Severity:</strong> ${input.signal.severity} / 100</p>
      <p><strong>Reliability:</strong> ${escapeHtml(reliability)}</p>
      <p><strong>Sources:</strong> ${escapeHtml(sourcesLine)}</p>
      ${freshLine}
      <p><strong>Country:</strong> ${escapeHtml(input.signal.country_code ?? '-')}</p>
      <p>${escapeHtml(input.signal.summary ?? 'No summary provided.')}</p>
      ${input.signal.url ? `<p><a href="${escapeHtml(input.signal.url)}">Open source link</a></p>` : ''}
      <p style="font-size:12px;color:#666">
        Reliability reflects how many independent credible sources are reporting this signal, not a claim
        of factual truth. Source counts update as our live-search fan-out (web + Reddit + Bluesky +
        GDELT + sensors) finds more coverage. Beta limit: up to 5 priority alerts/day per user.
      </p>
    </div>
  `;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: `Priority Alert · ${input.signal.title.slice(0, 90)}`,
        html,
      }),
    });
    if (!r.ok) return { ok: false, error: await r.text() };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
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

async function countSentAlertsToday(sb: ReturnType<typeof supabase>, userId: string) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { data } = await sb
    .from('alert_deliveries')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'sent')
    .gte('sent_at', since.toISOString());
  return data?.length ?? 0;
}

function effectiveSeverityThreshold(base: number, intensity: string) {
  if (intensity === 'critical_only') return Math.max(base, 90);
  if (intensity === 'important_and_up') return Math.max(base, 80);
  return Math.max(base, 70);
}
