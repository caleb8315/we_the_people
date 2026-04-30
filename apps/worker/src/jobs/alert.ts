import { canAlert, statusLabel } from '@osint/core/verification';
import type { VerificationStatus } from '@osint/core/types';
import { env } from '../lib/env';
import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';
import { consumeUserDailyLimit } from '../lib/daily-limits';
import { logProductEvent } from '../lib/product-events';
import { createUserNotification } from '../lib/user-notifications';

/**
 * Alert job — runs every N minutes.
 *
 * MVP policy: the worker sends operator/admin notifications when a
 * "priority" signal appears (severity >= 80, corroborated or developing).
 * Per-user alerts are opt-in and written to in-app notifications using
 * user preferences.
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

  const { data: prefsRows } = await sb
    .from('preferences')
    .select(
      'user_id, alerts_enabled, notifications_enabled, min_alert_severity, muted_sources, muted_topics, topics, alert_intensity_preference, max_alerts_per_day_preference',
    )
    .eq('alerts_enabled', true)
    .eq('notifications_enabled', true);

  for (const pref of prefsRows ?? []) {
    const localDailyCap = Math.max(1, Math.min(5, Number(pref.max_alerts_per_day_preference ?? 3)));
    const intensity = String(pref.alert_intensity_preference ?? 'critical_only');

    const deliveryCount = await countSentAlertsToday(sb, pref.user_id);
    const usageCount = await countUsageToday(sb, pref.user_id);
    let localSent = Math.max(deliveryCount, usageCount);

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

      const cap = await consumeUserDailyLimit(sb, pref.user_id, 'priority_alert', localDailyCap);
      if (!cap.ok) {
        await sb.from('alert_deliveries').insert({
          signal_id: signal.id,
          user_id: pref.user_id,
          email: null,
          status: 'skipped',
          error: `daily alert cap reached (${cap.limit}/day)`,
        });
        break;
      }

      const reliability = statusLabel(signal.verification_status as VerificationStatus);
      const credible = signal.credible_source_count ?? 0;
      const total = signal.source_count ?? 0;
      const domains = (signal.distinct_domains ?? []).slice(0, 3);
      const moreDomains = (signal.distinct_domains ?? []).length - domains.length;
      const sourcesLine =
        total > 0
          ? `${credible}/${total} credible` +
            (domains.length > 0
              ? ` · ${domains.join(', ')}${moreDomains > 0 ? ` + ${moreDomains} more` : ''}`
              : '')
          : 'Corroboration in progress';
      const freshLine = signal.last_enriched_at
        ? 'Freshly corroborated in the latest live-search pass.'
        : null;

      const notification = await createUserNotification(sb, {
        userId: pref.user_id,
        type: 'priority_alert',
        title: `Priority alert · ${signal.title.slice(0, 120)}`,
        summary: `${String(signal.topic ?? 'other')} · severity ${signal.severity} · ${reliability}`,
        body: [
          `${signal.title}`,
          `Topic: ${String(signal.topic ?? 'other')}`,
          `Severity: ${signal.severity}/100`,
          `Reliability: ${reliability}`,
          `Sources: ${sourcesLine}`,
          freshLine,
          `Country: ${String(signal.country_code ?? '-')}`,
          signal.summary ?? 'No summary provided.',
          signal.url ? `Source: ${signal.url}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        signalId: signal.id,
        data: {
          signal_id: signal.id,
          severity: signal.severity,
          topic: signal.topic ?? 'other',
          verification_status: signal.verification_status,
          source_url: signal.url ?? null,
        },
      });
      if (!notification.ok) {
        errors.push(notification.error ?? 'unknown alert notification error');
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
        email: null,
        status: notification.ok ? 'sent' : 'failed',
        error: notification.ok ? null : notification.error?.slice(0, 500),
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

async function countUsageToday(sb: ReturnType<typeof supabase>, userId: string) {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from('user_daily_usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('day', day)
    .eq('bucket', 'priority_alert');
  return (data ?? []).reduce((sum, r) => sum + Number(r.calls ?? 0), 0);
}

function effectiveSeverityThreshold(base: number, intensity: string) {
  if (intensity === 'critical_only') return Math.max(base, 90);
  if (intensity === 'important_and_up') return Math.max(base, 80);
  return Math.max(base, 70);
}
