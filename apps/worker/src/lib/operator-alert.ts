import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Operator self-monitoring alerts.
 *
 * When a background job fails, partially fails, or crashes, the worker emails
 * the operator so a broken pipeline never fails silently. Delivery is
 * best-effort and multi-channel: it uses whichever of Resend / Brevo / Telegram
 * is configured, and NEVER throws (an alerting failure must not take down the
 * job that was trying to report a problem).
 *
 * A `dedupe_key` + throttle window collapses a storm of identical failures
 * (e.g. a cron that fails every 5 minutes) into a single email per window, so
 * the operator inbox stays usable. The throttle is enforced in
 * `public.operator_alerts` and fails OPEN — if the table is missing or the
 * claim errors for any reason other than a duplicate, we still send the email.
 */

const DEFAULT_OPERATOR_EMAIL = 'calebphillips.ai@gmail.com';
const DEFAULT_FROM_EMAIL = 'alerts@crosscheck.news';
const DEFAULT_THROTTLE_MINUTES = 60;

export type AlertSeverity = 'info' | 'warn' | 'error';

export interface OperatorAlertInput {
  /** Short, human-readable subject line. */
  subject: string;
  /** Body text. Kept plain-text for maximum deliverability. */
  body: string;
  severity?: AlertSeverity;
  /**
   * Stable key identifying this class of alert (e.g. "engine_run:alert").
   * Repeated alerts with the same base key inside a throttle window are
   * suppressed. Defaults to a hash-ish of the subject.
   */
  dedupeKey?: string;
  /** Override the default throttle window (minutes). */
  throttleMinutes?: number;
}

interface ChannelResults {
  resend?: 'sent' | 'error' | 'skipped';
  brevo?: 'sent' | 'error' | 'skipped';
  telegram?: 'sent' | 'error' | 'skipped';
}

function operatorEmail(): string {
  return (process.env.OPERATOR_ALERT_EMAIL || DEFAULT_OPERATOR_EMAIL).trim();
}

function fromEmail(): string {
  return (
    process.env.ALERT_FROM_EMAIL ||
    process.env.BRIEFING_FROM_EMAIL ||
    DEFAULT_FROM_EMAIL
  ).trim();
}

function throttleWindowMs(override?: number): number {
  const minutes = Number(
    override ?? process.env.OPERATOR_ALERT_THROTTLE_MINUTES ?? DEFAULT_THROTTLE_MINUTES,
  );
  const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_THROTTLE_MINUTES;
  return safe * 60_000;
}

function baseKey(input: OperatorAlertInput): string {
  if (input.dedupeKey) return input.dedupeKey;
  return input.subject.toLowerCase().replace(/\s+/g, '-').slice(0, 80);
}

/**
 * Claim a throttle slot for this alert window. Returns true if THIS caller may
 * send (i.e. no prior alert exists for the window), false if it was already
 * claimed. Fails OPEN: any unexpected error returns true so alerts are never
 * silently dropped because of a monitoring-table problem.
 */
async function claimThrottleSlot(
  sb: SupabaseClient | undefined,
  input: OperatorAlertInput,
): Promise<{ send: boolean; rowId: string | null; dedupeKey: string }> {
  const windowMs = throttleWindowMs(input.throttleMinutes);
  const bucket = Math.floor(Date.now() / windowMs);
  const dedupeKey = `${baseKey(input)}:${bucket}`;

  if (!sb) return { send: true, rowId: null, dedupeKey };

  try {
    const { data, error } = await sb
      .from('operator_alerts')
      .insert({
        dedupe_key: dedupeKey,
        severity: input.severity ?? 'error',
        subject: input.subject.slice(0, 300),
        body: input.body.slice(0, 8000),
      })
      .select('id')
      .single();

    if (!error) return { send: true, rowId: (data?.id as string) ?? null, dedupeKey };

    const msg = String(error.message ?? '').toLowerCase();
    // Duplicate = another run already alerted for this window. Suppress.
    if (msg.includes('duplicate key') || msg.includes('unique') || error.code === '23505') {
      return { send: false, rowId: null, dedupeKey };
    }
    // Any other error (table missing, transient) → fail open and still send.
    return { send: true, rowId: null, dedupeKey };
  } catch {
    return { send: true, rowId: null, dedupeKey };
  }
}

async function recordChannels(
  sb: SupabaseClient | undefined,
  rowId: string | null,
  channels: ChannelResults,
): Promise<void> {
  if (!sb || !rowId) return;
  try {
    await sb.from('operator_alerts').update({ channels }).eq('id', rowId);
  } catch {
    // best-effort
  }
}

async function sendResend(subject: string, body: string): Promise<'sent' | 'error' | 'skipped'> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return 'skipped';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `Crosscheck Alerts <${fromEmail()}>`,
        to: [operatorEmail()],
        subject: subject.slice(0, 200),
        text: body.slice(0, 20000),
      }),
    });
    return res.ok ? 'sent' : 'error';
  } catch {
    return 'error';
  }
}

async function sendBrevo(subject: string, body: string): Promise<'sent' | 'error' | 'skipped'> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return 'skipped';
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: fromEmail(), name: 'Crosscheck Alerts' },
        to: [{ email: operatorEmail() }],
        subject: subject.slice(0, 200),
        textContent: body.slice(0, 20000),
      }),
    });
    return res.ok ? 'sent' : 'error';
  } catch {
    return 'error';
  }
}

async function sendTelegram(text: string): Promise<'sent' | 'error' | 'skipped'> {
  const e = env();
  if (!e.TELEGRAM_BOT_TOKEN || !e.TELEGRAM_OPERATOR_CHAT_ID) return 'skipped';
  try {
    const res = await fetch(`https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: e.TELEGRAM_OPERATOR_CHAT_ID,
        text: text.slice(0, 4090),
        disable_web_page_preview: true,
      }),
    });
    return res.ok ? 'sent' : 'error';
  } catch {
    return 'error';
  }
}

/**
 * Emit an operator alert across every configured channel. Best-effort and
 * non-throwing. Pass the service-role Supabase client to enable throttling.
 */
export async function sendOperatorAlert(
  input: OperatorAlertInput,
  sb?: SupabaseClient,
): Promise<{ sent: boolean; throttled: boolean; channels: ChannelResults }> {
  const severity = input.severity ?? 'error';
  const prefix = severity === 'error' ? '🔴' : severity === 'warn' ? '🟡' : 'ℹ️';
  const subject = `[Crosscheck ${severity.toUpperCase()}] ${input.subject}`.slice(0, 200);
  const body = [
    `${prefix} ${input.subject}`,
    '',
    input.body,
    '',
    `— Crosscheck automated monitor · ${new Date().toISOString()}`,
  ].join('\n');

  try {
    const slot = await claimThrottleSlot(sb, input);
    if (!slot.send) {
      return { sent: false, throttled: true, channels: {} };
    }

    const [resend, brevo, telegram] = await Promise.all([
      sendResend(subject, body),
      sendBrevo(subject, body),
      sendTelegram(body),
    ]);
    const channels: ChannelResults = { resend, brevo, telegram };
    await recordChannels(sb, slot.rowId, channels);

    const sent = resend === 'sent' || brevo === 'sent' || telegram === 'sent';
    if (!sent) {
      // Nothing delivered — surface loudly in logs so the CI/Actions run at
      // least captures it even when no email channel is configured.
      console.warn(
        `[operator-alert] no channel delivered (${JSON.stringify(channels)}). ` +
          `Configure RESEND_API_KEY, BREVO_API_KEY, or TELEGRAM_* to receive emails. ` +
          `Alert was: ${subject}`,
      );
    } else {
      console.log(`[operator-alert] delivered: ${subject} (${JSON.stringify(channels)})`);
    }
    return { sent, throttled: false, channels };
  } catch (err) {
    console.error('[operator-alert] failed to send:', (err as Error).message);
    return { sent: false, throttled: false, channels: {} };
  }
}
