import {
  classifyTopic,
  computeExpiry,
  decideVerification,
  detectInconsistencies,
  extractDomain,
  heuristicConfidence,
  heuristicSeverity,
  isCredibleDomain,
  makeDedupeKey,
  toContradictions,
} from '@osint/core';
import type { EvidenceItem, Topic, VerificationStatus } from '@osint/core/types';

import { loadAdapters } from '../adapters/index';
import type { RawItem } from '../adapters/base';
import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';

/**
 * Ingest job — runs on GH Actions cron (hourly):
 *   1. Fetch from every enabled source in parallel (adapter-per-source).
 *   2. Group items by dedupe key (so 5 outlets on same story collapse).
 *   3. Score severity + confidence heuristically (no LLM).
 *   4. Decide verification status (credible count + non-kinetic quarantine).
 *   5. Upsert signals + evidence atomically.
 */
export async function runIngest(): Promise<{
  fetched: number;
  signals: number;
  evidence: number;
  contradictions: number;
}> {
  const runId = await startEngineRun('ingest');
  const errors: string[] = [];

  const adapters = await loadAdapters();
  console.log(`[ingest] starting — ${adapters.length} adapters enabled`);

  // Parallel fetch.
  const results = await Promise.allSettled(adapters.map(a => a.fetch()));
  const items: RawItem[] = [];
  let fetched = 0;
  results.forEach((r, i) => {
    const a = adapters[i]!;
    if (r.status === 'fulfilled') {
      items.push(...r.value);
      fetched += r.value.length;
      console.log(`[ingest] ${a.id}: ${r.value.length}`);
    } else {
      const msg = `${a.id}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`;
      console.warn('[ingest] fetch failed — ' + msg);
      errors.push(msg);
    }
  });

  // Group by dedupe key across sources.
  const groups = new Map<string, RawItem[]>();
  for (const raw of items) {
    const topic = raw.topic ?? classifyTopic(raw.title, raw.summary);
    const key = makeDedupeKey({
      title: raw.title,
      country_code: raw.country_code ?? null,
      occurred_at: raw.published_at ?? null,
      topic,
    });
    const bucket = groups.get(key) ?? [];
    bucket.push(raw);
    groups.set(key, bucket);
  }

  console.log(`[ingest] ${fetched} items → ${groups.size} unique signals`);

  // Build signal rows + evidence rows.
  const sb = supabase();
  let signalInserts = 0;
  let evidenceInserts = 0;
  let contradictionInserts = 0;

  for (const [dedupe_key, rawGroup] of groups) {
    try {
      const primary = rawGroup[0]!;
      const topic = primary.topic ?? classifyTopic(primary.title, primary.summary);
      const evidence: EvidenceItem[] = rawGroup.map(r => {
        const dom = extractDomain(r.url);
        return {
          source_id: r.source_id,
          url: r.url,
          domain: dom,
          title: r.title,
          published_at: r.published_at ?? null,
          is_credible: isCredibleDomain(dom),
          excerpt: (r.summary ?? '').slice(0, 500) || null,
        };
      });

      const decision = decideVerification(primary.title, primary.summary ?? '', evidence);
      const severity = Math.max(
        primary.severity ?? 0,
        heuristicSeverity(primary.title, primary.summary),
      );
      const confidence = heuristicConfidence(
        decision.source_count,
        decision.credible_source_count,
      );
      const status: VerificationStatus = decision.status;

      const signalRow = {
        dedupe_key,
        title: primary.title.slice(0, 500),
        summary: (primary.summary ?? '').slice(0, 2000) || null,
        url: primary.url,
        source_id: primary.source_id,
        topic,
        country_code: primary.country_code ?? null,
        severity,
        confidence,
        verification_status: status,
        source_count: decision.source_count,
        credible_source_count: decision.credible_source_count,
        distinct_domains: decision.distinct_domains,
        tags: decision.decision_log.includes('non-kinetic') ? ['non_kinetic'] : [],
        occurred_at: primary.published_at ?? null,
        expires_at: computeExpiry(severity, topic, status),
        raw_data: {
          decision_log: decision.decision_log,
          group_size: rawGroup.length,
          ...(primary.raw ?? {}),
        },
      };

      const { data: upserted, error: upsertErr } = await sb
        .from('signals')
        .upsert(signalRow, { onConflict: 'dedupe_key' })
        .select('id')
        .single();

      if (upsertErr || !upserted) {
        errors.push(`upsert signal: ${upsertErr?.message ?? 'unknown'}`);
        continue;
      }
      signalInserts++;

      // Replace-evidence strategy: delete + re-insert for this signal.
      await sb.from('evidence').delete().eq('signal_id', upserted.id);
      const evidenceRows = evidence.map(e => ({ signal_id: upserted.id, ...e }));
      let insertedEvidenceIds: string[] = [];
      if (evidenceRows.length > 0) {
        const { data: evData, error: evErr } = await sb
          .from('evidence')
          .insert(evidenceRows)
          .select('id');
        if (evErr) {
          errors.push(`evidence insert: ${evErr.message}`);
        } else {
          evidenceInserts += evidenceRows.length;
          insertedEvidenceIds = (evData ?? []).map((r: { id: string }) => r.id);
        }
      }

      // Contradictions: detect inconsistencies across this signal's evidence,
      // then replace any prior contradiction rows for the signal.
      const hints = detectInconsistencies(
        { title: primary.title, summary: primary.summary ?? null },
        evidence,
      );
      await sb.from('contradictions').delete().eq('signal_id', upserted.id);
      if (hints.length > 0) {
        const rows = toContradictions(upserted.id, hints, insertedEvidenceIds);
        const { error: cErr } = await sb.from('contradictions').insert(rows);
        if (cErr) errors.push(`contradiction insert: ${cErr.message}`);
        else contradictionInserts += rows.length;
      }
    } catch (err) {
      errors.push(`group: ${(err as Error).message}`);
    }
  }

  await finishEngineRun(runId, {
    status: errors.length === 0 ? 'success' : errors.length > groups.size / 2 ? 'failed' : 'partial',
    records_in: fetched,
    records_out: signalInserts,
    errors,
    meta: {
      groups: groups.size,
      evidence: evidenceInserts,
      contradictions: contradictionInserts,
    },
  });

  console.log(
    `[ingest] done: ${signalInserts} signals, ${evidenceInserts} evidence, ${contradictionInserts} contradictions, ${errors.length} errors`,
  );
  return {
    fetched,
    signals: signalInserts,
    evidence: evidenceInserts,
    contradictions: contradictionInserts,
  };
}
