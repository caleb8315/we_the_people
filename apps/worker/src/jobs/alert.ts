import { canAlert } from '@osint/core/verification';
import { env } from '../lib/env';
import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';

/**
 * Alert job — runs every N minutes.
 *
 * MVP policy: the worker sends operator/admin notifications when a
 * "priority" signal appears (severity >= 80, verified or developing).
 * Per-user push alerts are opt-in and delivered via email (Resend)
 * using user preferences. This file implements the operator channel;
 * per-user push is wired up with email delivery in a later phase.
 */
export async function runAlerts(): Promise<{ sent: number }> {
  const runId = await startEngineRun('alert');
  const sb = supabase();

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('signals')
    .select('id, title, summary, severity, verification_status, topic, country_code, url, first_seen_at')
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
  for (const s of candidates) {
    const ok = await sendOperatorTelegram(
      [
        `🟡 PRIORITY · ${s.topic?.toUpperCase() ?? 'EVENT'}`,
        `${s.title}`,
        `severity=${s.severity} · ${s.verification_status} · ${s.country_code ?? '—'}`,
        s.url ?? '',
      ].join('\n'),
    );
    if (ok) sent++;
  }

  await finishEngineRun(runId, {
    status: 'success',
    records_in: candidates.length,
    records_out: sent,
  });
  console.log(`[alert] sent=${sent}/${candidates.length}`);
  return { sent };
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
