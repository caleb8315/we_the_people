import { supabase } from '../lib/supabase';
import { sendOperatorAlert } from '../lib/operator-alert';

/**
 * Watchdog — proactive pipeline health check.
 *
 * The per-job failure alerts (see finishEngineRun / the workflow notify step)
 * catch runs that fail loudly. The watchdog catches the quieter problems:
 *   - a cron that stopped running entirely (no recent success at all),
 *   - ingest that "succeeds" but stops producing fresh signals.
 *
 * It writes NOTHING and only reads recent telemetry, so it is safe to run on
 * a tight cadence. Alerts are throttled by operator-alert's dedupe window.
 *
 * NOTE: GitHub disables *all* scheduled workflows on a repo after ~60 days of
 * no commits, which would also stop this watchdog. That failure mode can only
 * be covered by an external uptime monitor (see docs/production-plan.md,
 * Phase 2). The watchdog covers everything short of "GitHub stopped us".
 */

interface WatchdogThresholds {
  /** Max minutes since the last successful ingest before we alert. */
  ingestStaleMinutes: number;
  /** Max minutes since the newest signal's first_seen_at before we warn. */
  signalStaleMinutes: number;
}

const DEFAULTS: WatchdogThresholds = {
  // Ingest runs every 15 min; GitHub cron drift can push effective cadence to
  // ~30 min. 90 min without a single success means the schedule is broken.
  ingestStaleMinutes: 90,
  // Feed can legitimately be quiet, so this is a softer "warn" threshold.
  signalStaleMinutes: 180,
};

export async function runWatchdog(
  overrides: Partial<WatchdogThresholds> = {},
): Promise<{ healthy: boolean; problems: string[] }> {
  // Merge per-field so an explicit `undefined` override (e.g. an unset CLI
  // flag) does NOT clobber the default and silently disable a check.
  const thresholds: WatchdogThresholds = {
    ingestStaleMinutes:
      Number.isFinite(overrides.ingestStaleMinutes as number)
        ? (overrides.ingestStaleMinutes as number)
        : DEFAULTS.ingestStaleMinutes,
    signalStaleMinutes:
      Number.isFinite(overrides.signalStaleMinutes as number)
        ? (overrides.signalStaleMinutes as number)
        : DEFAULTS.signalStaleMinutes,
  };
  const sb = supabase();
  const problems: string[] = [];
  const now = Date.now();

  // 1. Last successful ingest run.
  const { data: lastIngest, error: ingestErr } = await sb
    .from('engine_runs')
    .select('finished_at, started_at, status')
    .eq('job', 'ingest')
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ingestErr) {
    problems.push(`Could not read engine_runs: ${ingestErr.message}`);
  } else if (!lastIngest) {
    problems.push('No successful ingest run has ever been recorded.');
  } else {
    const ts = new Date(lastIngest.finished_at ?? lastIngest.started_at).getTime();
    const ageMin = Math.round((now - ts) / 60_000);
    if (ageMin > thresholds.ingestStaleMinutes) {
      problems.push(
        `Last successful ingest was ${ageMin} min ago (threshold ${thresholds.ingestStaleMinutes} min). ` +
          'The ingest schedule may be broken or disabled.',
      );
    }
  }

  // 2. Freshness of the newest signal.
  const { data: newestSignal, error: signalErr } = await sb
    .from('signals')
    .select('first_seen_at')
    .order('first_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (signalErr) {
    problems.push(`Could not read signals: ${signalErr.message}`);
  } else if (newestSignal?.first_seen_at) {
    const ageMin = Math.round((now - new Date(newestSignal.first_seen_at).getTime()) / 60_000);
    if (ageMin > thresholds.signalStaleMinutes) {
      problems.push(
        `Newest signal is ${ageMin} min old (threshold ${thresholds.signalStaleMinutes} min). ` +
          'Ingest may be running but not producing rows.',
      );
    }
  }

  if (problems.length === 0) {
    console.log('[watchdog] healthy — recent ingest success and fresh signals.');
    return { healthy: true, problems: [] };
  }

  console.warn('[watchdog] unhealthy:\n' + problems.map((p) => `• ${p}`).join('\n'));
  await sendOperatorAlert(
    {
      subject: 'pipeline watchdog detected a problem',
      severity: 'error',
      dedupeKey: 'watchdog:pipeline',
      body: ['The Crosscheck watchdog found one or more problems:', '', ...problems.map((p) => `• ${p}`)].join(
        '\n',
      ),
    },
    sb,
  );
  return { healthy: false, problems };
}
