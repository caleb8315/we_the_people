import {
  assessPhysicalEvidence,
  buildReliabilitySummary,
  classifyTopic,
  clusterItems,
  computeExpiry,
  computeReliabilityScores,
  decideVerification,
  detectInconsistenciesWithLimits,
  extractClaimsFromEvidence,
  extractDomain,
  heuristicConfidence,
  heuristicSeverity,
  isCredibleDomain,
  MAX_CLAIMS_PER_SIGNAL,
  MAX_SOURCES_PER_SIGNAL,
  reliabilityPublicLabel,
} from '@osint/core';
// makeDedupeKey uses `node:crypto` and therefore lives OUTSIDE the
// browser-safe barrel above. Import it from the subpath so no client
// bundle ever pulls it in.
import { makeDedupeKey } from '@osint/core/dedupe';
import type { EvidenceItem, Topic, VerificationStatus } from '@osint/core/types';

import { loadAdapters } from '../adapters/index';
import type { RawItem } from '../adapters/base';
import { upsertContradictions } from '../lib/contradictions';
import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';

/**
 * Ingest job — runs on GH Actions cron (hourly):
 *   1. Fetch from every enabled source in parallel (adapter-per-source).
 *   2. Group items by dedupe key (so 5 outlets on same story collapse).
 *   3. Score severity + confidence heuristically (no LLM).
 *   4. Decide reliability / corroboration status (credible count + non-kinetic quarantine).
 *   5. Upsert signals + evidence atomically.
 *   6. Detect source disagreements and write them to `contradictions`.
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

  // ── Classify topics up-front (needed for both clustering and dedupe) ──
  const itemTopics: string[] = items.map(
    raw => raw.topic ?? classifyTopic(raw.title, raw.summary),
  );

  // ── Cluster articles about the same real-world event ──────────────────
  // Two-pass strategy:
  //   Pass 1 — keyword-similarity clustering (Jaccard on key terms within
  //            each topic+day bucket).  This merges "Iran strikes kill
  //            dozens in Gaza" and "Casualties reported after Iranian
  //            attack on Gaza" into one group even though the headlines
  //            differ.  O(n·k) where k = articles per topic per day.
  //   Pass 2 — derive a stable dedupe_key per cluster (SHA-1 of the
  //            representative/primary title) for the DB upsert.
  const clusterables = items.map((raw, i) => ({
    title: raw.title,
    topic: itemTopics[i]!,
    published_day: raw.published_at ? raw.published_at.slice(0, 10) : '',
  }));
  const clusterIds = clusterItems(clusterables);

  // Build groups keyed by cluster id, then assign a stable dedupe key per
  // cluster using the first-seen (representative) article's title.
  const clusterBuckets = new Map<number, RawItem[]>();
  for (let i = 0; i < items.length; i++) {
    const cid = clusterIds[i]!;
    let bucket = clusterBuckets.get(cid);
    if (!bucket) {
      bucket = [];
      clusterBuckets.set(cid, bucket);
    }
    bucket.push(items[i]!);
  }

  const groups = new Map<string, RawItem[]>();
  for (const [, bucket] of clusterBuckets) {
    const rep = bucket[0]!;
    const topic = rep.topic ?? classifyTopic(rep.title, rep.summary);
    const key = makeDedupeKey({
      title: rep.title,
      country_code: rep.country_code ?? null,
      occurred_at: rep.published_at ?? null,
      topic,
    });
    // If an exact-hash collision occurs across clusters (extremely rare),
    // merge into the existing bucket rather than silently dropping.
    const existing = groups.get(key);
    if (existing) {
      existing.push(...bucket);
    } else {
      groups.set(key, bucket);
    }
  }

  console.log(`[ingest] ${fetched} items → ${clusterBuckets.size} clusters → ${groups.size} unique signals`);

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

      // Phase 2 / 7: detect contradictions + reliability BEFORE the signal
      // upsert so the reliability scores land on the initial row write. We
      // tag evidence with a temporary index id here and re-map to DB ids
      // after the evidence insert below. The existing severity / confidence
      // / verification_status trio is left untouched — reliability augments.
      //
      // Phase 7 safety rails: contradiction detection is capped at
      // MAX_SOURCES_PER_SIGNAL / MAX_CLAIMS_PER_SIGNAL. When either limit
      // is hit the detector is skipped (no partial output, no LLM
      // fallback), and we tag the signal with `complex_signal` so the UI
      // can show "detection skipped — too many sources" instead of
      // misleading readers with a zero-contradictions feed for a truly
      // divisive story.
      const indexedEvidence = evidence.map((e, i) => ({ ...e, id: `idx:${i}` }));
      const claims = extractClaimsFromEvidence(indexedEvidence);
      const detection = detectInconsistenciesWithLimits(claims, {
        sources_count: evidence.length,
      });
      const contradictions = detection.contradictions;
      if (detection.skipped) {
        console.log(
          `[ingest] skipped contradictions for dedupe_key=${dedupe_key}: ${detection.reason} (sources=${detection.source_count}, claims=${detection.claim_count}, limits=${MAX_SOURCES_PER_SIGNAL}/${MAX_CLAIMS_PER_SIGNAL})`,
        );
      }
      const reliability = computeReliabilityScores({
        evidence,
        claims,
        contradictions,
      });
      // Phase 3 — user-facing label + deterministic one-sentence summary.
      const reliabilityLabelPublic = reliabilityPublicLabel(reliability.reliability_score);
      const reliabilitySummary = buildReliabilitySummary({
        contradictions_count: contradictions.length,
        evidence_strength_score: reliability.evidence_strength_score,
        agreement_score: reliability.agreement_score,
      });
      // Phase 5 — structured physical-evidence assessment. Atomic with the
      // signal write (same per-group try block); stashed in raw_data so no
      // schema migration is required for this phase.
      const physicalEvidence = assessPhysicalEvidence({
        evidence,
        topic,
        title: primary.title,
        summary: primary.summary,
      });

      // Compose signal tags. Each tag is a compact, machine-readable flag
      // that the UI and ops tooling can filter on. `complex_signal` is the
      // Phase-7 marker: contradiction detection was deliberately skipped
      // for this signal because it blew past the source / claim caps.
      const tags: string[] = [];
      if (decision.decision_log.includes('non-kinetic')) tags.push('non_kinetic');
      if (detection.skipped) tags.push('complex_signal');

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
        tags,
        occurred_at: primary.published_at ?? null,
        expires_at: computeExpiry(severity, topic, status),
        // Phase-2 reliability columns (migration 015).
        reliability_score: reliability.reliability_score,
        agreement_score: reliability.agreement_score,
        source_independence_score: reliability.source_independence_score,
        narrative_divergence_score: reliability.narrative_divergence_score,
        evidence_strength_score: reliability.evidence_strength_score,
        // Phase-3 user-facing contract (migration 016).
        reliability_label: reliabilityLabelPublic,
        reliability_summary: reliabilitySummary,
        raw_data: {
          decision_log: decision.decision_log,
          group_size: rawGroup.length,
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

      // Contradictions — atomic with the signal write. Enforces the
      // required contract: extract → detect → upsert, idempotent and
      // scoped per signal_id (delete-then-insert, no duplicates).
      // Re-map the temporary `idx:N` evidence references to the real DB ids
      // returned from the evidence insert above; drop any that didn't land.
      const indexToDbId = new Map<string, string>();
      insertedEvidenceIds.forEach((dbId, i) => indexToDbId.set(`idx:${i}`, dbId));
      const contradictionsForWrite = contradictions.map((c) => ({
        ...c,
        evidence_ids: c.evidence_ids
          .map((ref) => indexToDbId.get(ref) ?? null)
          .filter((id): id is string => typeof id === 'string'),
      }));
      const contraRes = await upsertContradictions(sb, upserted.id, contradictionsForWrite);
      if (contraRes.error) errors.push(`contradiction: ${contraRes.error}`);
      contradictionInserts += contraRes.inserted;
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
