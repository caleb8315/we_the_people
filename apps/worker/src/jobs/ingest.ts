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
  extractKeyTerms,
  heuristicConfidence,
  heuristicSeverity,
  isCredibleDomain,
  MAX_CLAIMS_PER_SIGNAL,
  MAX_SOURCES_PER_SIGNAL,
  registerDynamicCredibleDomains,
  reliabilityPublicLabel,
  tagWireProvenance,
  countIndependentSources,
  MinHashSignature,
  LshIndex,
  getHashParams,
} from '@osint/core';
import { computeCredibilityUpdates, type SignalOutcome } from '@osint/core/dynamic-credibility';
import { prepareExistingSignals, matchClustersToExisting } from '@osint/core/signal-matcher';
import { makeDedupeKey } from '@osint/core/dedupe';
import type { EvidenceItem, Topic, VerificationStatus } from '@osint/core/types';

import { loadAdapters } from '../adapters/index';
import type { RawItem } from '../adapters/base';
import { upsertContradictions } from '../lib/contradictions';
import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';

const RECENT_SIGNAL_HOURS = 72;

/**
 * Ingest job — runs on GH Actions cron (hourly):
 *   1. Fetch from every enabled source in parallel (adapter-per-source).
 *   2. Group items by dedupe key (so 5 outlets on same story collapse).
 *   3. Cross-run match: compare new clusters against recent DB signals.
 *   4. Score severity + confidence heuristically (no LLM).
 *   5. Decide reliability / corroboration status (credible count + non-kinetic quarantine).
 *   6. Upsert signals + evidence atomically.
 *   7. Detect source disagreements and write them to `contradictions`.
 */
export async function runIngest(): Promise<{
  fetched: number;
  signals: number;
  evidence: number;
  contradictions: number;
  crossRunMatches: number;
}> {
  const runId = await startEngineRun('ingest');
  const errors: string[] = [];

  const adapters = await loadAdapters();
  console.log(`[ingest] starting — ${adapters.length} adapters enabled`);

  const { data: sourceRows } = await supabase()
    .from('sources')
    .select('credibility, metadata')
    .eq('enabled', true);
  if (sourceRows) {
    registerDynamicCredibleDomains(sourceRows as Array<{ credibility: number; metadata: Record<string, unknown> }>);
    console.log(`[ingest] registered ${sourceRows.length} DB sources for dynamic credibility`);
  }

  // ── Phase 1: Load recent signals for cross-run matching ───────────────
  // Use first_seen_at OR occurred_at to catch signals where occurred_at is
  // NULL (many RSS items lack a publication date). The previous query used
  // .gte('occurred_at', cutoff) which silently dropped all NULL rows —
  // meaning those signals were invisible to the cross-run matcher.
  const recentCutoff = new Date(Date.now() - RECENT_SIGNAL_HOURS * 3600 * 1000).toISOString();
  const { data: recentSignals } = await supabase()
    .from('signals')
    .select('dedupe_key, title, topic, occurred_at, first_seen_at')
    .or(`occurred_at.gte.${recentCutoff},first_seen_at.gte.${recentCutoff}`)
    .order('first_seen_at', { ascending: false })
    .limit(1000);

  const preparedSignals = prepareExistingSignals(recentSignals ?? []);
  console.log(`[ingest] loaded ${preparedSignals.length} recent signals for cross-run matching`);

  // Parallel fetch — NO URL dedup before clustering. The previous approach
  // skipped articles whose URLs already existed in evidence, but this
  // prevented NEW outlets covering the SAME story from ever entering the
  // pipeline. Each outlet has a unique URL, so URL dedup was only blocking
  // re-processing of the same feed item — which the upsert already handles
  // via dedupe_key. Removing this layer ensures all fresh articles get a
  // chance to cluster and cross-run match.
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

  // ── Classify topics up-front ──────────────────────────────────────────
  const itemTopics: string[] = items.map(
    raw => raw.topic ?? classifyTopic(raw.title, raw.summary),
  );

  // ── Cluster articles about the same real-world event ──────────────────
  const clusterables = items.map((raw, i) => ({
    title: raw.title,
    topic: itemTopics[i]!,
    published_day: raw.published_at ? raw.published_at.slice(0, 10) : '',
  }));
  const clusterIds = clusterItems(clusterables);

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

  // Build initial groups with generated dedupe keys
  const groups = new Map<string, RawItem[]>();
  const clusterMeta: Array<{
    dedupe_key: string;
    title: string;
    topic: string;
    published_day: string;
  }> = [];

  for (const [, bucket] of clusterBuckets) {
    const rep = bucket[0]!;
    const topic = rep.topic ?? classifyTopic(rep.title, rep.summary);
    const key = makeDedupeKey({
      title: rep.title,
      country_code: rep.country_code ?? null,
      occurred_at: rep.published_at ?? null,
      topic,
    });
    const existing = groups.get(key);
    if (existing) {
      existing.push(...bucket);
    } else {
      groups.set(key, bucket);
      clusterMeta.push({
        dedupe_key: key,
        title: rep.title,
        topic,
        published_day: rep.published_at ? rep.published_at.slice(0, 10) : '',
      });
    }
  }

  // ── LSH dedup pass: merge near-duplicate clusters within this batch ───
  const hashParams = getHashParams();
  const lshIndex = new LshIndex(128, 32);
  const lshMerges = new Map<string, string>(); // victim → survivor
  for (const meta of clusterMeta) {
    const terms = extractKeyTerms(meta.title);
    const sig = MinHashSignature.fromTokens(terms, hashParams);
    const candidates = lshIndex.querySorted(sig, 0.4);
    if (candidates.length > 0) {
      const best = candidates[0]!;
      lshMerges.set(meta.dedupe_key, best.key);
    } else {
      lshIndex.insert(meta.dedupe_key, sig);
    }
  }

  if (lshMerges.size > 0) {
    for (const [victim, survivor] of lshMerges) {
      const victimBucket = groups.get(victim);
      if (victimBucket) {
        const survivorBucket = groups.get(survivor);
        if (survivorBucket) {
          survivorBucket.push(...victimBucket);
          groups.delete(victim);
        }
      }
    }
    console.log(`[ingest] LSH dedup merged ${lshMerges.size} near-duplicate clusters`);
  }

  // ── Phase 1: Cross-run matching ───────────────────────────────────────
  // Compare each new cluster against recent existing signals. If a match
  // is found, remap the dedupe_key so the upsert merges evidence into
  // the existing signal instead of creating a duplicate.
  const remapping = matchClustersToExisting(clusterMeta, preparedSignals);
  let crossRunMatches = 0;

  // Diagnostic: log when cross-run matching finds nothing
  if (preparedSignals.length > 0 && clusterMeta.length > 0 && remapping.size === 0) {
    console.log(`[ingest] cross-run: 0 matches from ${clusterMeta.length} clusters against ${preparedSignals.length} existing signals`);
  }
  // Track which final dedupe_keys are cross-run targets (for additive evidence)
  const crossRunTargets = new Set<string>();

  if (remapping.size > 0) {
    const remappedGroups = new Map<string, RawItem[]>();
    for (const [originalKey, bucket] of groups) {
      const newKey = remapping.get(originalKey) ?? originalKey;
      if (newKey !== originalKey) {
        crossRunMatches++;
        crossRunTargets.add(newKey);
        console.log(
          `[ingest] cross-run match: "${bucket[0]?.title?.slice(0, 60)}" → existing signal`,
        );
      }
      const existing = remappedGroups.get(newKey);
      if (existing) {
        existing.push(...bucket);
      } else {
        remappedGroups.set(newKey, bucket);
      }
    }
    groups.clear();
    for (const [k, v] of remappedGroups) groups.set(k, v);
  }

  console.log(
    `[ingest] ${fetched} items → ${items.length} after URL dedup → ${clusterBuckets.size} clusters → ${groups.size} unique signals (${crossRunMatches} cross-run matches)`,
  );

  // Build signal rows + evidence rows.
  const sb = supabase();
  let signalInserts = 0;
  let evidenceInserts = 0;
  let contradictionInserts = 0;
  const signalOutcomes: SignalOutcome[] = [];

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

      // For cross-run matched signals, fetch existing evidence to get the
      // full picture for verification / reliability scoring.
      let combinedEvidence = evidence;
      if (crossRunTargets.has(dedupe_key)) {
        const { data: existingRows } = await sb
          .from('signals')
          .select('id')
          .eq('dedupe_key', dedupe_key)
          .single();
        if (existingRows?.id) {
          const { data: oldEvidence } = await sb
            .from('evidence')
            .select('source_id, url, domain, title, published_at, is_credible, excerpt')
            .eq('signal_id', existingRows.id);
          if (oldEvidence && oldEvidence.length > 0) {
            // Merge: add existing evidence rows that aren't duplicated by URL
            const newUrls = new Set(evidence.map(e => e.url));
            const additionalEvidence = oldEvidence.filter(
              (e: any) => !newUrls.has(e.url),
            ) as EvidenceItem[];
            combinedEvidence = [...evidence, ...additionalEvidence];
          }
        }
      }

      // ── Wire provenance: detect syndicated wire copy ──────────────────
      const taggedEvidence = tagWireProvenance(combinedEvidence);
      const independence = countIndependentSources(taggedEvidence);

      const decision = decideVerification(primary.title, primary.summary ?? '', combinedEvidence);

      // Log wire provenance data for the UI, but do NOT override source_count.
      // Users need to see the full source count to understand multi-source coverage.
      // The independence data is preserved in raw_data for the detail page.
      if (Object.keys(independence.wire_groups).length > 0) {
        decision.decision_log.push(
          `wire_provenance: ${independence.total} total domains, ${independence.independent} independent (wire: ${JSON.stringify(independence.wire_groups)})`,
        );
      }

      const severity = Math.max(
        primary.severity ?? 0,
        heuristicSeverity(primary.title, primary.summary),
      );
      const confidence = heuristicConfidence(
        decision.source_count,
        decision.credible_source_count,
      );
      const status: VerificationStatus = decision.status;

      const indexedEvidence = combinedEvidence.map((e, i) => ({ ...e, id: `idx:${i}` }));
      const claims = extractClaimsFromEvidence(indexedEvidence);
      const detection = detectInconsistenciesWithLimits(claims, {
        sources_count: combinedEvidence.length,
      });
      const contradictions = detection.contradictions;
      if (detection.skipped) {
        console.log(
          `[ingest] skipped contradictions for dedupe_key=${dedupe_key}: ${detection.reason} (sources=${detection.source_count}, claims=${detection.claim_count}, limits=${MAX_SOURCES_PER_SIGNAL}/${MAX_CLAIMS_PER_SIGNAL})`,
        );
      }
      const reliability = computeReliabilityScores({
        evidence: combinedEvidence,
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
        evidence: combinedEvidence,
        topic,
        title: primary.title,
        summary: primary.summary,
      });

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
        reliability_score: reliability.reliability_score,
        agreement_score: reliability.agreement_score,
        source_independence_score: reliability.source_independence_score,
        narrative_divergence_score: reliability.narrative_divergence_score,
        evidence_strength_score: reliability.evidence_strength_score,
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

      // Track outcomes for dynamic credibility updates
      signalOutcomes.push({
        signal_id: upserted.id,
        verification_status: status,
        source_ids: [...new Set(combinedEvidence.map(e => e.source_id).filter((s): s is string => !!s))],
        has_contradictions: contradictions.length > 0,
        credible_source_count: decision.credible_source_count,
      });

      // For cross-run matches, we ADD new evidence rather than replacing
      // all evidence. For fresh signals, replace-all is still correct.
      const isRemap = crossRunTargets.has(dedupe_key);
      if (!isRemap) {
        await sb.from('evidence').delete().eq('signal_id', upserted.id);
      }

      // Only insert evidence rows that are genuinely new (by URL)
      const newEvidenceRows = evidence.map(e => ({ signal_id: upserted.id, ...e }));
      let insertedEvidenceIds: string[] = [];
      if (newEvidenceRows.length > 0) {
        // For cross-run matches, check which URLs already exist
        if (isRemap) {
          const { data: existingEvUrls } = await sb
            .from('evidence')
            .select('url')
            .eq('signal_id', upserted.id);
          const existingSet = new Set((existingEvUrls ?? []).map((r: any) => r.url));
          const trulyNew = newEvidenceRows.filter(r => !existingSet.has(r.url));
          if (trulyNew.length > 0) {
            const { data: evData, error: evErr } = await sb
              .from('evidence')
              .insert(trulyNew)
              .select('id');
            if (evErr) {
              errors.push(`evidence insert: ${evErr.message}`);
            } else {
              evidenceInserts += trulyNew.length;
              insertedEvidenceIds = (evData ?? []).map((r: { id: string }) => r.id);
            }
          }
        } else {
          const { data: evData, error: evErr } = await sb
            .from('evidence')
            .insert(newEvidenceRows)
            .select('id');
          if (evErr) {
            errors.push(`evidence insert: ${evErr.message}`);
          } else {
            evidenceInserts += newEvidenceRows.length;
            insertedEvidenceIds = (evData ?? []).map((r: { id: string }) => r.id);
          }
        }
      }

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

  // ── Dynamic credibility: update source scores via EMA ─────────────────
  let credibilityUpdates = 0;
  if (signalOutcomes.length > 0) {
    try {
      const { data: allSources } = await sb
        .from('sources')
        .select('id, credibility')
        .eq('enabled', true);
      if (allSources) {
        const currentScores = new Map<string, number>();
        for (const s of allSources) currentScores.set(s.id, s.credibility);

        const updates = computeCredibilityUpdates(signalOutcomes, currentScores);
        for (const u of updates) {
          const { error: updErr } = await sb
            .from('sources')
            .update({ credibility: u.new_score })
            .eq('id', u.source_id);
          if (!updErr) {
            credibilityUpdates++;
          }
        }
        if (credibilityUpdates > 0) {
          console.log(`[ingest] updated credibility for ${credibilityUpdates} sources`);
        }
      }
    } catch (err) {
      errors.push(`credibility update: ${(err as Error).message}`);
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
      crossRunMatches,
      lshMerges: lshMerges.size,
      credibilityUpdates,
    },
  });

  console.log(
    `[ingest] done: ${signalInserts} signals, ${evidenceInserts} evidence, ${contradictionInserts} contradictions, ${crossRunMatches} cross-run matches, ${errors.length} errors`,
  );
  return {
    fetched,
    signals: signalInserts,
    evidence: evidenceInserts,
    contradictions: contradictionInserts,
    crossRunMatches,
  };
}
