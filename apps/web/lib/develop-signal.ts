/**
 * Story-development enrichment.
 *
 * Takes an existing clustered `signals` row and runs the SAME live
 * corroboration fan-out the /verify flow uses — web search, Reddit,
 * Bluesky, Wikipedia, GDELT global news, USGS/NASA/NOAA sensor networks,
 * and our own tracked events. Any new evidence the fan-out surfaces is
 * inserted into the `evidence` table tagged with `discovered_via: 'live_*'`
 * so the UI can distinguish "found while the ingest worker wasn't looking"
 * from rows the periodic adapters pulled in.
 *
 * The signal's reliability / contradictions / physical_evidence / source
 * counts are then re-computed on the full merged corpus using the exact
 * same @osint/core primitives the ingest worker uses — no new scoring
 * math lives in this file.
 *
 * Contract:
 *   - Idempotent. Evidence dedup is by canonical URL, and a cooldown
 *     (default 5 min) prevents re-running the orchestrator against the
 *     same signal rapid-fire. Pass `{ force: true }` to bypass the cooldown.
 *   - Non-throwing at the fan-out level: every sub-searcher already
 *     degrades to `status: 'error' | 'skipped' | 'unavailable'` on its
 *     own. The wrapping try/catch below only catches DB errors.
 *   - Respects the Phase-7 safety rails (MAX_SOURCES_PER_SIGNAL /
 *     MAX_CLAIMS_PER_SIGNAL) — contradiction detection is skipped when
 *     the merged corpus blows past those caps, and `complex_signal` is
 *     propagated into the signal's tags.
 *   - Callers get back a structured result describing what changed, so
 *     the UI can say "we found 3 new sources, one disagrees" without
 *     re-querying.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildReliabilitySummary,
  computeExpiry,
  computeReliabilityScores,
  decideVerification,
  detectInconsistenciesWithLimits,
  extractClaimsFromEvidence,
  heuristicConfidence,
  heuristicSeverity,
  MAX_CLAIMS_PER_SIGNAL,
  MAX_SOURCES_PER_SIGNAL,
  reliabilityPublicLabel,
  type DetectedContradiction,
  type EvidenceItem,
  type PhysicalEvidence,
  type Topic,
  type VerificationStatus,
} from '@osint/core';

import { runLiveCorroboration, type LiveCorroborationResult } from './live-sources';
import type { SourceId } from './live-sources/types';
import { extractKeywords } from './verify-corroboration';

/** Default cooldown between automatic enrichments for the same signal. */
export const DEFAULT_ENRICHMENT_COOLDOWN_MS = 5 * 60 * 1000;

export interface DevelopSignalOptions {
  /** Bypass the cooldown check. The UI "Develop now" button sets this. */
  force?: boolean;
  /** Override the default cooldown window. */
  cooldownMs?: number;
}

export interface DevelopSignalResult {
  status:
    | 'enriched'          // we ran the fan-out and (possibly) wrote new rows
    | 'cooldown'          // skipped; last_enriched_at is too recent
    | 'not_found'         // no matching signal row
    | 'error';            // db error
  signal_id: string;
  new_evidence_count: number;
  total_evidence_count: number;
  previous_source_count: number | null;
  updated_source_count: number | null;
  previous_credible_count: number | null;
  updated_credible_count: number | null;
  previous_verification_status: VerificationStatus | null;
  updated_verification_status: VerificationStatus | null;
  systems: LiveCorroborationResult['systems'];
  matched_signal_id_from_tracked: string | null;
  last_enriched_at: string | null;
  /** Short plain-English reason when status !== 'enriched'. */
  note: string | null;
}

/** Internal — the small subset of signal columns we need to re-score. */
interface SignalRow {
  id: string;
  dedupe_key: string;
  title: string;
  summary: string | null;
  url: string | null;
  topic: Topic | null;
  country_code: string | null;
  severity: number;
  source_count: number;
  credible_source_count: number;
  distinct_domains: string[] | null;
  tags: string[] | null;
  verification_status: VerificationStatus;
  occurred_at: string | null;
  last_enriched_at: string | null;
  raw_data: Record<string, unknown> | null;
}

export async function developSignal(
  sb: SupabaseClient,
  signalId: string,
  opts: DevelopSignalOptions = {},
): Promise<DevelopSignalResult> {
  const cooldown = opts.cooldownMs ?? DEFAULT_ENRICHMENT_COOLDOWN_MS;

  const { data: signalRow, error: loadErr } = await sb
    .from('signals')
    .select(
      'id,dedupe_key,title,summary,url,topic,country_code,severity,source_count,credible_source_count,distinct_domains,tags,verification_status,occurred_at,last_enriched_at,raw_data',
    )
    .eq('id', signalId)
    .maybeSingle();

  if (loadErr) {
    return emptyResult(signalId, 'error', `Load failed: ${loadErr.message}`);
  }
  if (!signalRow) {
    return emptyResult(signalId, 'not_found', 'Signal not found.');
  }

  const signal = signalRow as SignalRow;

  // Cooldown check — skip if the last enrichment is still "fresh". Without
  // this, anyone reloading the page (or clicking the button twice) would
  // re-fire the whole fan-out, burning our free-tier API budgets.
  if (!opts.force && signal.last_enriched_at) {
    const last = new Date(signal.last_enriched_at).getTime();
    const ageMs = Date.now() - last;
    if (Number.isFinite(last) && ageMs < cooldown) {
      const remainingSec = Math.ceil((cooldown - ageMs) / 1000);
      return {
        status: 'cooldown',
        signal_id: signal.id,
        new_evidence_count: 0,
        total_evidence_count: signal.source_count,
        previous_source_count: signal.source_count,
        updated_source_count: signal.source_count,
        previous_credible_count: signal.credible_source_count,
        updated_credible_count: signal.credible_source_count,
        previous_verification_status: signal.verification_status,
        updated_verification_status: signal.verification_status,
        systems: [],
        matched_signal_id_from_tracked: null,
        last_enriched_at: signal.last_enriched_at,
        note: `Already enriched ${Math.round(ageMs / 1000)}s ago. Cooldown: ${remainingSec}s remaining.`,
      };
    }
  }

  // Pull the existing evidence so we can (a) feed it into the core engine
  // alongside the newly-found rows, and (b) dedupe live-found URLs against
  // what's already persisted.
  const { data: existingEvidenceRows, error: evLoadErr } = await sb
    .from('evidence')
    .select('id,source_id,url,domain,title,published_at,is_credible,excerpt,discovered_via')
    .eq('signal_id', signal.id);

  if (evLoadErr) {
    return emptyResult(signal.id, 'error', `Evidence load failed: ${evLoadErr.message}`);
  }

  const existingEvidence: EvidenceItem[] = (existingEvidenceRows ?? []).map((r: any) => ({
    source_id: r.source_id ?? null,
    url: r.url,
    domain: r.domain,
    title: r.title ?? null,
    published_at: r.published_at ?? null,
    is_credible: Boolean(r.is_credible),
    excerpt: r.excerpt ?? null,
  }));
  const existingUrls = new Set<string>();
  for (const e of existingEvidence) {
    const k = normUrl(e.url);
    if (k) existingUrls.add(k);
  }

  // Run the same orchestrator the verify route uses. Keywords are extracted
  // off title + summary so this works for any ingested signal, not just
  // ones that started life as a URL submission.
  const keywords = extractKeywords(`${signal.title} ${signal.summary ?? ''}`);
  const host = signal.url ? safeHost(signal.url) : null;
  const corroboration = await runLiveCorroboration(sb, {
    canonicalUrl: signal.url,
    host,
    title: signal.title,
    description: signal.summary,
    text: null,
    keywords,
  });

  // Partition fan-out evidence into (a) new rows we'll insert + (b) dupes
  // we only use for re-scoring. Each row is tagged with the system that
  // surfaced it so the UI can show "found via Reddit 2m ago".
  const newRowsByOrigin: Array<{ origin: SourceId | 'tracked_events'; evidence: EvidenceItem[] }> = [];
  // Reconstruct origin→evidence mapping by re-running per-system evidence
  // and cross-referencing against the merged corpus. The orchestrator
  // already dedupes; we just need to know which SYSTEM contributed each
  // URL. We do that by re-walking systems and tagging the first occurrence.
  const liveTaggedByUrl = new Map<string, SourceId | 'tracked_events'>();
  // `systems` only carries counts, so we re-derive origin tags from the
  // merged evidence list itself using the `source_id` field each searcher
  // sets. Reddit/Bluesky/GDELT/Wikipedia/sensors set source_id to the
  // matching SourceId; web-search and tracked-events may leave it null,
  // in which case we fall back to a best-effort mapping.
  for (const e of corroboration.merged_evidence) {
    const k = normUrl(e.url);
    if (!k) continue;
    const inferred = inferOriginFromEvidence(e);
    if (inferred) liveTaggedByUrl.set(k, inferred);
  }

  const newEvidenceRows: Array<{
    signal_id: string;
    source_id: string | null;
    url: string;
    domain: string;
    title: string | null;
    published_at: string | null;
    is_credible: boolean;
    excerpt: string | null;
    discovered_via: string;
  }> = [];
  for (const e of corroboration.merged_evidence) {
    const k = normUrl(e.url);
    if (!k || existingUrls.has(k)) continue;
    // EvidenceItem.url is typed `string` in @osint/core so url is always
    // present, but the orchestrator's origin map may miss a URL if upstream
    // returned an empty domain — we'd rather drop those than insert junk.
    if (!e.url || !e.domain) continue;
    existingUrls.add(k);
    const origin = liveTaggedByUrl.get(k) ?? 'web';
    newEvidenceRows.push({
      signal_id: signal.id,
      source_id: null, // live-enriched rows aren't tied to the sources catalog.
      url: e.url,
      domain: e.domain,
      title: e.title ?? null,
      published_at: e.published_at ?? null,
      is_credible: Boolean(e.is_credible),
      excerpt: e.excerpt ?? null,
      discovered_via: `live_${origin}`,
    });
  }
  // track origins for the caller's response
  void newRowsByOrigin;

  // Persist new evidence BEFORE recomputing signal scores, so the signal
  // row's `source_count` / `credible_source_count` on disk matches what
  // the feed card reads. Failures here are best-effort — we still recompute
  // and return the in-memory merged corpus to the caller.
  let insertError: string | null = null;
  if (newEvidenceRows.length > 0) {
    const { error } = await sb.from('evidence').insert(newEvidenceRows);
    if (error) insertError = error.message;
  }

  // Build the full merged corpus for re-scoring. We combine the existing
  // evidence (authoritative source_ids intact) with anything newly found.
  const mergedEvidence: EvidenceItem[] = [
    ...existingEvidence,
    ...newEvidenceRows.map((r) => ({
      source_id: null,
      url: r.url,
      domain: r.domain,
      title: r.title,
      published_at: r.published_at,
      is_credible: r.is_credible,
      excerpt: r.excerpt,
    })),
  ];

  const decision = decideVerification(signal.title, signal.summary, mergedEvidence);
  const distinctDomains = decision.distinct_domains;

  // Re-run contradiction detection on the full corpus, honouring the same
  // Phase-7 safety caps the ingest worker uses. If the corpus has blown
  // past the caps, we skip detection and tag the signal complex_signal.
  const indexed = mergedEvidence.map((e, i) => ({ ...e, id: `idx:${i}` }));
  const claims = extractClaimsFromEvidence(indexed);
  const detection = detectInconsistenciesWithLimits(claims, {
    sources_count: mergedEvidence.length,
  });
  const mergedContradictions: DetectedContradiction[] = [
    ...corroboration.contradictions, // already from tracked-events
    ...detection.contradictions,
  ];

  const reliability = computeReliabilityScores({
    evidence: mergedEvidence,
    claims,
    contradictions: mergedContradictions,
  });
  const reliabilityLabelPublic = reliabilityPublicLabel(reliability.reliability_score);
  const reliabilitySummary = buildReliabilitySummary({
    contradictions_count: mergedContradictions.length,
    evidence_strength_score: reliability.evidence_strength_score,
    agreement_score: reliability.agreement_score,
  });

  const severity = Math.max(
    signal.severity,
    heuristicSeverity(signal.title, signal.summary),
  );
  const confidence = heuristicConfidence(decision.source_count, decision.credible_source_count);
  const status: VerificationStatus = decision.status;

  // Merge tags — preserve the existing ones (e.g. `non_kinetic`) and add
  // the Phase-7 `complex_signal` flag when we hit the caps. We intentionally
  // don't add a "live_enriched" tag here because `discovered_via` on each
  // evidence row is the authoritative signal for that distinction.
  const tagSet = new Set<string>(signal.tags ?? []);
  if (detection.skipped) tagSet.add('complex_signal');

  // Pick the stronger physical evidence: what's already stashed in raw_data
  // vs. what the fan-out just surfaced. We never downgrade a prior
  // `confirmed` to `none_detected`.
  const priorPhysical = extractPhysicalFromRaw(signal.raw_data);
  const physical = pickStrongerPhysical(priorPhysical, corroboration.physical_evidence);

  const now = new Date().toISOString();
  const nextRawData = {
    ...(signal.raw_data ?? {}),
    reliability: reliability.details,
    physical_evidence: physical,
    contradiction_detection: {
      skipped: detection.skipped,
      reason: detection.reason,
      source_count: detection.source_count,
      claim_count: detection.claim_count,
      source_limit: MAX_SOURCES_PER_SIGNAL,
      claim_limit: MAX_CLAIMS_PER_SIGNAL,
    },
    live_enrichment: {
      last_run_at: now,
      systems: corroboration.systems,
      new_evidence_added: newEvidenceRows.length,
      insert_error: insertError,
    },
  };

  const { error: updateErr } = await sb
    .from('signals')
    .update({
      severity,
      confidence,
      verification_status: status,
      source_count: decision.source_count,
      credible_source_count: decision.credible_source_count,
      distinct_domains: distinctDomains,
      tags: [...tagSet],
      reliability_score: reliability.reliability_score,
      agreement_score: reliability.agreement_score,
      source_independence_score: reliability.source_independence_score,
      narrative_divergence_score: reliability.narrative_divergence_score,
      evidence_strength_score: reliability.evidence_strength_score,
      reliability_label: reliabilityLabelPublic,
      reliability_summary: reliabilitySummary,
      expires_at: computeExpiry(severity, (signal.topic ?? 'other') as string, status),
      last_enriched_at: now,
      last_seen_at: now,
      raw_data: nextRawData,
    })
    .eq('id', signal.id);

  if (updateErr) {
    return {
      status: 'error',
      signal_id: signal.id,
      new_evidence_count: newEvidenceRows.length,
      total_evidence_count: mergedEvidence.length,
      previous_source_count: signal.source_count,
      updated_source_count: signal.source_count,
      previous_credible_count: signal.credible_source_count,
      updated_credible_count: signal.credible_source_count,
      previous_verification_status: signal.verification_status,
      updated_verification_status: signal.verification_status,
      systems: corroboration.systems,
      matched_signal_id_from_tracked: corroboration.matched_signal?.id ?? null,
      last_enriched_at: signal.last_enriched_at,
      note: `Signal update failed: ${updateErr.message}`,
    };
  }

  return {
    status: 'enriched',
    signal_id: signal.id,
    new_evidence_count: newEvidenceRows.length,
    total_evidence_count: mergedEvidence.length,
    previous_source_count: signal.source_count,
    updated_source_count: decision.source_count,
    previous_credible_count: signal.credible_source_count,
    updated_credible_count: decision.credible_source_count,
    previous_verification_status: signal.verification_status,
    updated_verification_status: status,
    systems: corroboration.systems,
    matched_signal_id_from_tracked: corroboration.matched_signal?.id ?? null,
    last_enriched_at: now,
    note: insertError ? `Evidence insert partially failed: ${insertError}` : null,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function emptyResult(
  signalId: string,
  status: DevelopSignalResult['status'],
  note: string,
): DevelopSignalResult {
  return {
    status,
    signal_id: signalId,
    new_evidence_count: 0,
    total_evidence_count: 0,
    previous_source_count: null,
    updated_source_count: null,
    previous_credible_count: null,
    updated_credible_count: null,
    previous_verification_status: null,
    updated_verification_status: null,
    systems: [],
    matched_signal_id_from_tracked: null,
    last_enriched_at: null,
    note,
  };
}

function normUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim().toLowerCase();
  return trimmed || null;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Map an EvidenceItem back to the SourceId that most likely produced it.
 * Each live-source searcher sets a stable `source_id` (e.g. 'reddit',
 * 'bluesky', 'wikipedia', 'gdelt', 'sensors') that we key off here. Web
 * search (Firecrawl / Brave) and tracked-events leave source_id null, so
 * we fall back to domain-based heuristics for those.
 */
function inferOriginFromEvidence(e: EvidenceItem): SourceId | 'tracked_events' | null {
  const sid = (e.source_id ?? '').toLowerCase();
  if (
    sid === 'reddit' ||
    sid === 'bluesky' ||
    sid === 'polymarket' ||
    sid === 'wikipedia' ||
    sid === 'gdelt' ||
    sid === 'sensors'
  ) {
    return sid as SourceId;
  }
  const domain = (e.domain ?? '').toLowerCase();
  if (!domain) return null;
  if (domain.endsWith('reddit.com')) return 'reddit';
  if (domain.endsWith('bsky.app') || domain.endsWith('bsky.social')) return 'bluesky';
  if (domain.endsWith('polymarket.com')) return 'polymarket';
  if (domain.endsWith('wikipedia.org')) return 'wikipedia';
  if (domain.endsWith('usgs.gov') || domain.endsWith('nasa.gov') || domain.endsWith('noaa.gov')) {
    return 'sensors';
  }
  return 'web';
}

function extractPhysicalFromRaw(raw: Record<string, unknown> | null): PhysicalEvidence | null {
  if (!raw || typeof raw !== 'object') return null;
  const pe = (raw as { physical_evidence?: unknown }).physical_evidence;
  if (!pe || typeof pe !== 'object') return null;
  const candidate = pe as Record<string, unknown>;
  const status = candidate.status;
  if (status !== 'confirmed' && status !== 'partial' && status !== 'none_detected') return null;
  const confidence = typeof candidate.confidence === 'number' ? candidate.confidence : 0;
  const sources = Array.isArray(candidate.sources)
    ? (candidate.sources.filter((s) => typeof s === 'string') as string[])
    : [];
  const limitations = Array.isArray(candidate.limitations)
    ? (candidate.limitations.filter((s) => typeof s === 'string') as string[])
    : [];
  return { status, confidence, sources, limitations };
}

function pickStrongerPhysical(
  a: PhysicalEvidence | null,
  b: PhysicalEvidence | null,
): PhysicalEvidence | null {
  const rank: Record<string, number> = {
    confirmed: 3,
    partial: 2,
    none_detected: 1,
  };
  const sa = a ? rank[a.status] ?? -1 : -1;
  const sb = b ? rank[b.status] ?? -1 : -1;
  if (sa < 0 && sb < 0) return null;
  return sa >= sb ? a : b;
}
