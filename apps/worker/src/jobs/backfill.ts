import {
  assessPhysicalEvidence,
  buildReliabilitySummary,
  computeReliabilityScores,
  detectInconsistenciesWithLimits,
  extractClaimsFromEvidence,
  MAX_CLAIMS_PER_SIGNAL,
  MAX_SOURCES_PER_SIGNAL,
  reliabilityPublicLabel,
} from '@osint/core';
import type { EvidenceItem } from '@osint/core/types';

import { upsertContradictions } from '../lib/contradictions';
import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';

/**
 * Phase-8 backfill worker.
 *
 * Replays the production scoring / contradiction / physical-evidence
 * pipeline against existing `signals` + `evidence` rows so that any signal
 * ingested before the phase 2–7 work landed gets populated with
 * `reliability_score`, `reliability_label`, `reliability_summary`,
 * structured `raw_data.physical_evidence`, and a re-derived contradictions
 * set.
 *
 * Hard rules:
 *   - We REPLAY existing evidence; we do not re-fetch from adapters, do
 *     not call LLMs, and do not touch `severity`, `confidence`, or
 *     `verification_status` (the phase 1 trio is left intact).
 *   - The window is bounded by `hoursBack` (default 48) and capped at a
 *     hard maximum of 168h so a mistyped "--hours=9999" cannot accidentally
 *     recompute months of history.
 *   - The filter `reliability_score IS NULL` means re-running the backfill
 *     is idempotent: signals already scored by ingest or a previous
 *     backfill invocation are skipped.
 *   - `dryRun: true` prints the plan without writing a single row, so ops
 *     can verify the candidate set before committing.
 */

const DEFAULT_HOURS_BACK = 48;
const MAX_HOURS_BACK = 168;            // absolute upper bound (7 days)
const DEFAULT_ROW_LIMIT = 500;         // per invocation; call again if needed
const MAX_ROW_LIMIT = 2000;

export interface BackfillOptions {
  /** How far back to look, in hours. Defaults to 48, capped at 168. */
  hoursBack?: number;
  /** Maximum signals to touch in one run. Defaults to 500, capped at 2000. */
  limit?: number;
  /** When true, scores are computed and logged but not written to the DB. */
  dryRun?: boolean;
}

export interface BackfillResult {
  candidates: number;
  processed: number;
  complex: number;
  errors: number;
  dry_run: boolean;
  window_hours: number;
}

export async function runBackfill(opts: BackfillOptions = {}): Promise<BackfillResult> {
  const hoursBack = clampHours(opts.hoursBack ?? DEFAULT_HOURS_BACK);
  const rowLimit = clampLimit(opts.limit ?? DEFAULT_ROW_LIMIT);
  const dryRun = opts.dryRun ?? false;
  const since = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();

  const runId = await startEngineRun('ingest');
  const errors: string[] = [];
  const sb = supabase();

  const { data: candidates, error: selErr } = await sb
    .from('signals')
    .select('id, title, summary, topic, country_code, tags, raw_data, first_seen_at')
    .gte('first_seen_at', since)
    .is('reliability_score', null)
    .order('first_seen_at', { ascending: false })
    .limit(rowLimit);

  if (selErr) {
    await finishEngineRun(runId, {
      status: 'failed',
      errors: [`backfill select: ${selErr.message}`],
      meta: { backfill: true, window_hours: hoursBack, dry_run: dryRun },
    });
    console.error(`[backfill] select failed: ${selErr.message}`);
    return {
      candidates: 0,
      processed: 0,
      complex: 0,
      errors: 1,
      dry_run: dryRun,
      window_hours: hoursBack,
    };
  }

  const rows = candidates ?? [];
  console.log(
    `[backfill] window=${hoursBack}h candidates=${rows.length} dryRun=${dryRun} limit=${rowLimit}`,
  );

  let processed = 0;
  let complexCount = 0;

  for (const signal of rows) {
    try {
      const { data: evRows, error: evErr } = await sb
        .from('evidence')
        .select('id, source_id, url, domain, title, published_at, is_credible, excerpt')
        .eq('signal_id', signal.id);
      if (evErr) {
        errors.push(`evidence fetch ${signal.id}: ${evErr.message}`);
        continue;
      }
      if (!evRows || evRows.length === 0) {
        // No evidence persisted for this signal — nothing to score. Mark
        // the run but don't touch the row.
        continue;
      }

      const evidence: EvidenceItem[] = evRows.map((e) => ({
        source_id: (e.source_id as string | null) ?? null,
        url: String(e.url ?? ''),
        domain: String(e.domain ?? ''),
        title: (e.title as string | null) ?? null,
        published_at: (e.published_at as string | null) ?? null,
        is_credible: Boolean(e.is_credible),
        excerpt: (e.excerpt as string | null) ?? null,
      }));

      // Claims carry the real DB evidence id so any contradictions we emit
      // reference the correct rows (same contract as ingest.ts).
      const claimsInput = evidence.map((e, i) => ({ ...e, id: String(evRows[i]!.id) }));
      const claims = extractClaimsFromEvidence(claimsInput);
      const detection = detectInconsistenciesWithLimits(claims, {
        sources_count: evidence.length,
      });
      const contradictions = detection.contradictions;

      const reliability = computeReliabilityScores({
        evidence,
        claims,
        contradictions,
      });
      const reliabilityLabelPublic = reliabilityPublicLabel(reliability.reliability_score);
      const reliabilitySummary = buildReliabilitySummary({
        contradictions_count: contradictions.length,
        evidence_strength_score: reliability.evidence_strength_score,
        agreement_score: reliability.agreement_score,
      });
      const physicalEvidence = assessPhysicalEvidence({
        evidence,
        topic: (signal.topic as string | null) ?? null,
        title: (signal.title as string | null) ?? null,
        summary: (signal.summary as string | null) ?? null,
      });

      // Merge tags — preserve every existing tag (e.g. `non_kinetic` from
      // the original verification decision), add `complex_signal` only if
      // the limit-aware detector refused to run.
      const existingTags = Array.isArray(signal.tags) ? (signal.tags as string[]) : [];
      const tagSet = new Set<string>(existingTags);
      if (detection.skipped) tagSet.add('complex_signal');

      const existingRaw =
        signal.raw_data && typeof signal.raw_data === 'object'
          ? (signal.raw_data as Record<string, unknown>)
          : {};
      const raw_data = {
        ...existingRaw,
        reliability: reliability.details,
        physical_evidence: physicalEvidence,
        contradiction_detection: {
          skipped: detection.skipped,
          reason: detection.reason,
          source_count: detection.source_count,
          claim_count: detection.claim_count,
          source_limit: MAX_SOURCES_PER_SIGNAL,
          claim_limit: MAX_CLAIMS_PER_SIGNAL,
        },
        backfilled_at: new Date().toISOString(),
      };

      if (dryRun) {
        console.log(
          `[backfill][dry] ${signal.id} reliability=${reliability.reliability_score} label=${reliabilityLabelPublic} contradictions=${contradictions.length} complex=${detection.skipped}`,
        );
      } else {
        const { error: upErr } = await sb
          .from('signals')
          .update({
            tags: [...tagSet],
            raw_data,
            reliability_score: reliability.reliability_score,
            agreement_score: reliability.agreement_score,
            source_independence_score: reliability.source_independence_score,
            narrative_divergence_score: reliability.narrative_divergence_score,
            evidence_strength_score: reliability.evidence_strength_score,
            reliability_label: reliabilityLabelPublic,
            reliability_summary: reliabilitySummary,
          })
          .eq('id', signal.id);
        if (upErr) {
          errors.push(`update ${signal.id}: ${upErr.message}`);
          continue;
        }
        // Replace-per-signal contract (same as ingest): delete prior rows
        // for this signal_id, insert the freshly detected set. No
        // duplicates even if this backfill overlaps with a live ingest.
        const contraRes = await upsertContradictions(sb, signal.id as string, contradictions);
        if (contraRes.error) {
          errors.push(`contradictions ${signal.id}: ${contraRes.error}`);
        }
      }

      processed += 1;
      if (detection.skipped) complexCount += 1;
    } catch (err) {
      errors.push(`${signal.id}: ${(err as Error).message}`);
    }
  }

  const status =
    errors.length === 0
      ? 'success'
      : errors.length > rows.length / 2
        ? 'failed'
        : 'partial';

  await finishEngineRun(runId, {
    status,
    records_in: rows.length,
    records_out: dryRun ? 0 : processed,
    errors,
    meta: {
      backfill: true,
      window_hours: hoursBack,
      row_limit: rowLimit,
      dry_run: dryRun,
      complex_signals: complexCount,
      default_hours: DEFAULT_HOURS_BACK,
      max_hours: MAX_HOURS_BACK,
    },
  });

  console.log(
    `[backfill] done candidates=${rows.length} processed=${processed} complex=${complexCount} errors=${errors.length} dryRun=${dryRun}`,
  );

  return {
    candidates: rows.length,
    processed,
    complex: complexCount,
    errors: errors.length,
    dry_run: dryRun,
    window_hours: hoursBack,
  };
}

function clampHours(h: number): number {
  if (!Number.isFinite(h)) return DEFAULT_HOURS_BACK;
  const rounded = Math.floor(h);
  if (rounded < 1) return 1;
  if (rounded > MAX_HOURS_BACK) {
    console.warn(
      `[backfill] requested window ${rounded}h exceeds the ${MAX_HOURS_BACK}h cap; clamping.`,
    );
    return MAX_HOURS_BACK;
  }
  return rounded;
}

function clampLimit(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_ROW_LIMIT;
  const rounded = Math.floor(n);
  if (rounded < 1) return 1;
  if (rounded > MAX_ROW_LIMIT) return MAX_ROW_LIMIT;
  return rounded;
}
