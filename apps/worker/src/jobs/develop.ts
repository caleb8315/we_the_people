/**
 * Story-development cron job (Phase 9).
 *
 * Periodically picks the most relevant stale "developing" signals and
 * asks the web app to run its live corroboration fan-out against them.
 * This keeps feed cards growing in coverage over time without waiting
 * for the next ingest cycle — every hour or two, signals that the
 * ingest adapters haven't touched pick up fresh web / Reddit / Bluesky /
 * Wikipedia / GDELT / sensor matches.
 *
 * Architecture note: the live corroboration pipeline (Firecrawl / Brave /
 * Bluesky auth tokens etc.) lives in the web app, not here. Rather than
 * duplicate env + code, we HTTP-call the same `/api/signal/:id/develop`
 * endpoint the UI button hits. This keeps the web app the single owner
 * of live-source configuration.
 *
 * Selection rules:
 *   - verification_status IN (developing, unverified) — we only enrich
 *     stories that are actively forming. Verified / quarantined signals
 *     already have a clear answer.
 *   - first_seen_at within the last 72h — older signals are unlikely to
 *     pick up new web coverage; enriching them wastes budget.
 *   - last_enriched_at IS NULL or < (now - cooldown) — same cooldown
 *     the UI honours (default 60 min here vs 5 min interactive).
 *   - ORDER BY severity DESC, source_count ASC — prioritise high-
 *     severity underreported signals; those benefit most from a wider
 *     corpus.
 *
 * Throughput rails:
 *   - Max N signals per run (default 8). Each call blocks for up to ~30s
 *     waiting on GDELT's free tier, so 8 serial calls fit comfortably in
 *     a 5-minute GitHub Actions step.
 *   - 6-second gap between calls to stay well under the web app's
 *     /api/signal/develop 10/min/IP rate limit.
 */

import { env } from '../lib/env';
import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';
import {
  callDevelopEndpoint,
  DEVELOP_INTER_CALL_DELAY_MS,
  sleep,
} from '../lib/develop-client';

const DEFAULT_MAX_SIGNALS = 8;
const DEFAULT_COOLDOWN_MINUTES = 60;
const DEFAULT_WINDOW_HOURS = 72;

export interface DevelopOptions {
  max?: number;
  cooldownMinutes?: number;
  windowHours?: number;
  dryRun?: boolean;
}

export async function runDevelop(opts: DevelopOptions = {}): Promise<{
  candidates: number;
  attempted: number;
  enriched: number;
  cooldown: number;
  errors: number;
  skipped_reason?: string;
}> {
  const max = opts.max ?? DEFAULT_MAX_SIGNALS;
  const cooldownMinutes = opts.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES;
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  const dryRun = Boolean(opts.dryRun);

  const runId = await startEngineRun('develop');
  const errors: string[] = [];

  const webUrl = env().WEB_APP_URL?.replace(/\/$/, '') ?? null;
  if (!webUrl) {
    await finishEngineRun(runId, {
      status: 'failed',
      records_in: 0,
      records_out: 0,
      errors: ['WEB_APP_URL not configured'],
      meta: {},
    });
    console.warn(
      '[develop] WEB_APP_URL not set. Add it to worker env (Vercel URL of the deployed web app, e.g. https://crosscheck.vercel.app) to enable this job.',
    );
    return { candidates: 0, attempted: 0, enriched: 0, cooldown: 0, errors: 0, skipped_reason: 'WEB_APP_URL not set' };
  }

  const sb = supabase();
  const sinceIso = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const cooldownIso = new Date(Date.now() - cooldownMinutes * 60_000).toISOString();

  // Candidate selection: stale developing/unverified signals inside the
  // window, either never enriched or past the cooldown, sorted to
  // prioritise high-severity & low-coverage (most upside for enrichment).
  const { data: candidates, error: selErr } = await sb
    .from('signals')
    .select(
      'id,title,severity,source_count,verification_status,last_enriched_at,first_seen_at',
    )
    .in('verification_status', ['developing', 'unverified'])
    .gte('first_seen_at', sinceIso)
    .or(`last_enriched_at.is.null,last_enriched_at.lt.${cooldownIso}`)
    .order('severity', { ascending: false })
    .order('source_count', { ascending: true })
    .limit(max * 3); // over-fetch; we'll trim to `max` after filter.

  if (selErr) {
    errors.push(`candidate selection: ${selErr.message}`);
    await finishEngineRun(runId, {
      status: 'failed',
      records_in: 0,
      records_out: 0,
      errors,
      meta: {},
    });
    return { candidates: 0, attempted: 0, enriched: 0, cooldown: 0, errors: 1 };
  }

  const rows = (candidates ?? []).slice(0, max);
  console.log(
    `[develop] starting — ${rows.length} candidates (window=${windowHours}h, cooldown=${cooldownMinutes}m, dryRun=${dryRun})`,
  );

  if (rows.length === 0) {
    await finishEngineRun(runId, {
      status: 'success',
      records_in: 0,
      records_out: 0,
      errors: [],
      meta: { candidates: 0 },
    });
    return { candidates: 0, attempted: 0, enriched: 0, cooldown: 0, errors: 0 };
  }

  if (dryRun) {
    for (const r of rows) {
      console.log(
        `[develop] [dry] id=${r.id} severity=${r.severity} sources=${r.source_count} status=${r.verification_status} last_enriched=${r.last_enriched_at ?? 'never'}`,
      );
    }
    await finishEngineRun(runId, {
      status: 'success',
      records_in: rows.length,
      records_out: 0,
      errors: [],
      meta: { dry_run: true, candidates: rows.length },
    });
    return { candidates: rows.length, attempted: 0, enriched: 0, cooldown: 0, errors: 0 };
  }

  let attempted = 0;
  let enriched = 0;
  let cooldown = 0;

  for (const row of rows) {
    attempted++;
    const r = await callDevelopEndpoint(webUrl, row.id);

    if (r.status === 'enriched') {
      enriched++;
      console.log(
        `[develop] enriched id=${row.id} new_evidence=${r.new_evidence_count} note=${r.note ?? 'ok'}`,
      );
    } else if (r.status === 'cooldown') {
      cooldown++;
      console.log(`[develop] cooldown id=${row.id} note=${r.note ?? ''}`);
    } else {
      errors.push(`signal=${row.id}: ${r.note ?? r.status}`);
      console.warn(`[develop] failed id=${row.id} status=${r.status} note=${r.note ?? ''}`);
    }

    // Space calls out — keeps us below the /api rate limit (10/min) and
    // gives the web function time to fully finish before the next one.
    if (attempted < rows.length) {
      await sleep(DEVELOP_INTER_CALL_DELAY_MS);
    }
  }

  await finishEngineRun(runId, {
    status: errors.length === 0 ? 'success' : errors.length > rows.length / 2 ? 'failed' : 'partial',
    records_in: rows.length,
    records_out: enriched,
    errors,
    meta: {
      candidates: rows.length,
      attempted,
      enriched,
      cooldown,
    },
  });

  console.log(
    `[develop] done: ${enriched}/${attempted} enriched, ${cooldown} on cooldown, ${errors.length} errors`,
  );
  return { candidates: rows.length, attempted, enriched, cooldown, errors: errors.length };
}
