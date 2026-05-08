import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assessImageProvenance,
  assessLinkProvenance,
  assessSocialProvenance,
  buildConfidenceReport,
  canonicalizeUrl,
  decideVerification,
  describeImageObservation,
  extractDomain,
  heuristicConfidence,
  isCredibleDomain,
  isSocialUrl,
  reliabilityPublicLabel,
  computeReliabilityScores,
  rankSources,
  summarizeRankedSources,
  analyzeConflicts,
  summarizeConflicts,
  detectCorpusBias,
  buildEvidenceCards,
  summarizeEvidenceCards,
  buildConfidenceBreakdown,
  buildResultExplanation,
  buildEvidenceCaseFile,
  decomposeClaims,
} from '@osint/core';
import type {
  ConfidenceReport,
  EvidenceItem,
  ImageObservationSnapshot,
  SocialProvenance,
  LinkProvenance,
  ImageProvenance,
  RankedSource,
  RankedSourceSummary,
  AnalyzedConflict,
  ConflictSummary,
  CorpusBiasReport,
  EvidenceCard,
  EvidenceCardSummary,
  ConfidenceBreakdown,
  ResultExplanation,
  EvidenceCaseFile,
} from '@osint/core';
import { getAdminSupabase, getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { logProductEvent } from '@/lib/product-events';
import {
  extractKeywords,
  fetchPageMetadata,
  runLiveCorroboration,
  type MatchedSignal,
} from '@/lib/verify-corroboration';
import { buildReaderReport, type ReaderReport } from '@/lib/reader-report';
import {
  runSpecializedCaseSearch,
  type SpecializedCaseSearchResult,
} from '@/lib/specialized-sources';

/** Cap on how many hosts we remember per image hash. Keeps rows small. */
const MAX_SEEN_HOSTS = 10;

/**
 * POST /api/verify — run a URL / text / image submission through the same
 * deterministic confidence engine that ranks the feed.
 *
 * Non-negotiable rules from the build plan:
 *   - No parallel systems: this route composes the existing core primitives
 *     (decideVerification, computeReliabilityScores, buildConfidenceReport)
 *     and NEVER re-implements reliability math locally.
 *   - Social submissions are capped at the `medium` band.
 *   - No LLM call.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// GDELT's free DOC 2.0 API is the slow tail of our fan-out — p95 can be
// 20-30s. We'd rather wait and give the user real coverage than return a
// "GDELT errored" chip, so we give the route a generous duration cap. 45s
// works on Vercel Hobby (max 60s) and leaves ~10s of headroom for our own
// processing + response. The client shows progressive "still searching…"
// messages so this long wait feels intentional, not broken.
export const maxDuration = 45;

const Body = z.object({
  kind: z.enum(['url', 'text', 'image']),
  url: z.string().url().optional(),
  text: z.string().max(4000).optional(),
  image_url: z.string().url().optional(),
  image_filename: z.string().max(256).optional(),
  image_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});

type VerifyResponse = {
  report: ConfidenceReport;
  /**
   * Phase 8 — plain-English breakdown of the report, composed from the
   * same inputs the engine used. The UI renders THIS instead of the raw
   * report for everything user-facing.
   */
  reader_report: ReaderReport;
  /**
   * April 2026 upgrade — evidence comparison platform layer.
   * Adds: ranked sources with rationale, an extended conflict taxonomy
   * with numeric severity, a bias signal layer, evidence cards with
   * stance, a 4-component confidence breakdown, and the four result
   * explanation sections (why this result, what would resolve this,
   * what sources agree on, what sources disagree on).
   *
   * The original `report` and `reader_report` shapes are unchanged so
   * existing callers keep working — `analysis` is purely additive.
   */
  analysis: {
    ranked_sources: RankedSource[];
    ranked_summary: RankedSourceSummary;
    conflicts: AnalyzedConflict[];
    conflict_summary: ConflictSummary;
    bias: CorpusBiasReport;
    evidence_cards: EvidenceCard[];
    cards_summary: EvidenceCardSummary;
    confidence_breakdown: ConfidenceBreakdown;
    explanation: ResultExplanation;
    case_file: EvidenceCaseFile;
    specialized_sources: SpecializedCaseSearchResult['systems'];
  };
  input: {
    kind: 'url' | 'text' | 'image';
    canonical_url: string | null;
    host: string | null;
    is_social: boolean;
    platform: string | null;
    platform_label: string | null;
    preview_text: string | null;
  };
  social: SocialProvenance | null;
  link: LinkProvenance | null;
  image: ImageProvenance | null;
  verification_id: string | null;
  case_id: string | null;
  /**
   * Phase 7 — live multi-system corroboration. Every submission fans out
   * in parallel to web search, Reddit, Bluesky, Wikipedia, GDELT, open
   * sensor networks, and our own tracked events. The coverage strip tells
   * the user honestly which systems we searched, and what each returned.
   */
  corroboration: {
    matched_signal: MatchedSignal | null;
    matched_by: 'url' | 'keyword' | null;
    total_sources: number;
    credible_sources: number;
    searched_title: string | null;
    systems: Array<{
      id: string;
      name: string;
      status: 'hit' | 'miss' | 'skipped' | 'unavailable' | 'error';
      hits: number;
      note: string;
      evidence_count: number;
    }>;
  };
};

export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'verify'), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const body = parsed.data;
  if (body.kind === 'url' && !body.url) {
    return NextResponse.json({ error: 'url_required' }, { status: 400 });
  }
  if (body.kind === 'text' && !body.text) {
    return NextResponse.json({ error: 'text_required' }, { status: 400 });
  }
  if (body.kind === 'image' && !body.image_url && !body.image_sha256) {
    return NextResponse.json({ error: 'image_url_or_hash_required' }, { status: 400 });
  }

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id ?? null;

  let social: SocialProvenance | null = null;
  let link: LinkProvenance | null = null;
  let image: ImageProvenance | null = null;
  let canonical_url: string | null = null;
  let host: string | null = null;
  let evidence: EvidenceItem[] = [];
  const provenanceWarnings: string[] = [];
  let capMedium = false;
  let title: string | null = null;

  if (body.kind === 'url' && body.url) {
    if (isSocialUrl(body.url)) {
      social = assessSocialProvenance(body.url);
      if (!social) {
        return NextResponse.json({ error: 'unparseable_social_url' }, { status: 400 });
      }
      canonical_url = social.canonical_url;
      host = (() => {
        try {
          return new URL(social.canonical_url).hostname.replace(/^www\./, '');
        } catch {
          return null;
        }
      })();
      title = `Social submission · ${social.platform_label}`;
      provenanceWarnings.push(...social.warnings);
      capMedium = social.cap_band_at_medium;
    } else {
      link = assessLinkProvenance(body.url);
      if (!link) return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
      canonical_url = link.canonical_url;
      host = link.host;
      title = `Link submission · ${link.host}`;
      provenanceWarnings.push(...link.tags);
    }
    const dom = extractDomain(canonical_url ?? body.url);
    evidence = [
      {
        source_id: null,
        url: canonical_url ?? body.url,
        domain: dom,
        title,
        published_at: null,
        is_credible: isCredibleDomain(dom),
        excerpt: null,
      },
    ];
  } else if (body.kind === 'text' && body.text) {
    title = body.text.slice(0, 120);
    evidence = [];
    provenanceWarnings.push(
      'Pasted text has no source attribution — confidence is derived from claim shape only.',
    );
    capMedium = true;
  } else if (body.kind === 'image') {
    const canon = body.image_url ? canonicalizeUrl(body.image_url) : null;
    canonical_url = canon?.url ?? null;
    host = canon?.host ?? null;
    image = assessImageProvenance({
      url: body.image_url ?? null,
      filename: body.image_filename ?? null,
      sha256: body.image_sha256 ?? null,
    });
    provenanceWarnings.push(...image.tags);
    // Phase 3 — deterministic first-seen / reused-image hash tracking. When
    // a client provides a SHA-256, we upsert into image_observations and
    // emit observation tags *based on the pre-upsert snapshot* so a fresh
    // submission reads as "first time seen" rather than "seen 1 time before".
    if (body.image_sha256) {
      const prior = await recordImageObservation({
        sha256: body.image_sha256.toLowerCase(),
        host,
      });
      provenanceWarnings.push(...describeImageObservation(prior, host));
    }
    title = body.image_filename ? `Image · ${body.image_filename}` : 'Image submission';
    capMedium = true;
    if (canonical_url) {
      const dom = extractDomain(canonical_url);
      evidence = [
        {
          source_id: null,
          url: canonical_url,
          domain: dom,
          title,
          published_at: null,
          is_credible: isCredibleDomain(dom),
          excerpt: null,
        },
      ];
    }
  }

  // Phase 7 — live multi-system corroboration. Instead of running the
  // confidence engine on just the submitted URL, we now fan out in
  // parallel to every independent verification system we can reach
  // (web search, Reddit, Bluesky, Wikipedia, GDELT global news, open
  // sensor networks, and our own clustered-events DB), then feed the
  // aggregated, deduped evidence into the SAME engine the feed uses.
  //
  // For URL submissions we still fetch the page's <title> / og:title
  // first so the search has something meaningful to work with — a bare
  // URL rarely shares enough tokens with external indexes to match.
  let searchedTitle: string | null = null;
  let pageDescription: string | null = null;
  if (body.kind === 'url' && body.url && !social) {
    const meta = await fetchPageMetadata(body.url);
    if (meta.title) {
      title = meta.title;
      searchedTitle = meta.title;
      pageDescription = meta.description;
      if (evidence[0]) {
        evidence[0] = { ...evidence[0], title: meta.title, excerpt: meta.description };
      }
    }
  }

  const keywords = extractKeywords(`${title ?? ''} ${body.text ?? ''}`);
  const corroboration = await runLiveCorroboration(sb, {
    canonicalUrl: canonical_url,
    host,
    title,
    description: pageDescription,
    text: body.text ?? null,
    keywords,
  });
  const specializedClaims = decomposeClaims({
    title: searchedTitle ?? title,
    text: body.kind === 'text' ? body.text ?? null : pageDescription,
    url: canonical_url ?? body.url ?? null,
    kind: body.kind,
    max_claims: 5,
  });
  const specialized = await runSpecializedCaseSearch(specializedClaims);

  // Merge the user's own submission at slot 0 so it stays the "primary"
  // source trace entry, then the deduped live + specialized corpus behind it.
  const mergedEvidence = dedupeByUrl([
    ...evidence,
    ...corroboration.merged_evidence,
    ...specialized.evidence,
  ]);

  // Run the same engine the feed uses. With corroboration folded in, this
  // now sees every outlet, social post, reference anchor, and sensor hit
  // that corroborates (or contradicts) the submission.
  const decision = decideVerification(title ?? '', body.text ?? null, mergedEvidence);
  const reliability = computeReliabilityScores({
    evidence: mergedEvidence,
    claims: [],
    contradictions: corroboration.contradictions,
  });
  // Prefer the clustered signal's own source counts when we matched one —
  // those are what the feed card shows, so verify stays in lockstep.
  const matchedSignal = corroboration.matched_signal;
  const sourceCount = matchedSignal
    ? Math.max(matchedSignal.source_count, decision.source_count)
    : decision.source_count;
  const credibleCount = matchedSignal
    ? Math.max(matchedSignal.credible_source_count, decision.credible_source_count)
    : decision.credible_source_count;

  const report = buildConfidenceReport({
    verification_status: decision.status,
    reliability_score: reliability.reliability_score,
    reliability_label: reliabilityPublicLabel(reliability.reliability_score),
    evidence: mergedEvidence,
    contradictions: corroboration.contradictions,
    physical_evidence: corroboration.physical_evidence,
    source_count: sourceCount,
    credible_source_count: credibleCount,
    complex_signal: corroboration.complex_signal,
    provenance_warnings: provenanceWarnings,
    cap_band_at_medium: capMedium,
  });
  // Silence unused-confidence lint while still asserting the heuristic matches.
  void heuristicConfidence(decision.source_count, decision.credible_source_count);

  // April 2026 evidence comparison upgrade. Each layer is additive and
  // pure — none of these rewrite the legacy `report`/`reader_report`.
  const ranked = rankSources({
    evidence: mergedEvidence,
    anchor_url: canonical_url ?? body.url ?? null,
  });
  const rankedSummary = summarizeRankedSources(ranked);
  const analyzedConflicts = analyzeConflicts({
    contradictions: corroboration.contradictions,
    evidence: mergedEvidence,
    claim_title: title,
    claim_text: body.text ?? null,
  });
  const conflictSummary = summarizeConflicts(analyzedConflicts);
  const evidenceCards = buildEvidenceCards({
    evidence: mergedEvidence,
    ranked,
    contradictions: corroboration.contradictions,
  });
  const cardsSummary = summarizeEvidenceCards(evidenceCards);

  // Bias is a SIGNAL, not a verdict — keep it strictly out of the
  // confidence breakdown so the score above never moves because of
  // tone alone.
  const corpusBias = detectCorpusBias(
    mergedEvidence.map((e) => `${e.title ?? ''} ${e.excerpt ?? ''}`),
  );

  const breakdown = buildConfidenceBreakdown({
    ranked,
    ranked_summary: rankedSummary,
    conflicts: analyzedConflicts,
    conflict_summary: conflictSummary,
    cards_summary: cardsSummary,
    has_anchor: Boolean(canonical_url),
    is_text_only: body.kind === 'text',
    cap_at_medium: capMedium,
  });
  const resultExplanation = buildResultExplanation({
    band: report.band,
    breakdown,
    ranked_summary: rankedSummary,
    conflicts: analyzedConflicts,
    conflict_summary: conflictSummary,
    cards_summary: cardsSummary,
    has_anchor: Boolean(canonical_url),
    is_text_only: body.kind === 'text',
    is_social: Boolean(social),
    subject:
      (searchedTitle ?? title ?? body.text?.slice(0, 120) ?? '').trim() || null,
  });
  const caseFile = buildEvidenceCaseFile({
    title: searchedTitle ?? title,
    text: body.kind === 'text' ? body.text ?? null : pageDescription,
    url: canonical_url ?? body.url ?? null,
    evidence: mergedEvidence,
    ranked_sources: ranked,
    evidence_cards: evidenceCards,
    contradictions: corroboration.contradictions,
    overall_band: report.band,
  });

  // Persist when the user is authenticated. Anonymous readers still get a
  // full confidence report back — we just don't retain a history row.
  let verification_id: string | null = null;
  let case_id: string | null = null;
  if (userId) {
    const { data, error } = await sb
      .from('verifications')
      .insert({
        user_id: userId,
        kind: body.kind,
        input_url: body.kind === 'url' ? body.url ?? null : body.kind === 'image' ? body.image_url ?? null : null,
        input_text: body.kind === 'text' ? body.text ?? null : null,
        image_filename: body.image_filename ?? null,
        image_sha256: body.image_sha256 ?? null,
        platform: social?.platform ?? null,
        host,
        is_social: Boolean(social),
        provenance_tags: provenanceWarnings.slice(0, 10),
        confidence_band: report.band,
        confidence_report: report,
        case_file: caseFile,
        status: 'ready',
      })
      .select('id')
      .single();
    if (!error && data) verification_id = (data as { id: string }).id;
    if (verification_id) {
      case_id = await persistCaseFile(sb, {
        userId,
        verificationId: verification_id,
        caseFile,
        inputKind: body.kind,
        inputUrl: body.kind === 'url' ? body.url ?? null : body.kind === 'image' ? body.image_url ?? null : null,
        inputText: body.kind === 'text' ? body.text ?? null : null,
      });
    }
  }

  // Phase 5 — KPI instrumentation. Deliberately fire-and-forget so an
  // events-write failure never blocks a user's verification response.
  if (userId) {
    try {
      await logProductEvent(sb, {
        userId,
        eventName: 'verify_submitted',
        eventProps: {
          kind: body.kind,
          band: report.band,
          is_social: Boolean(social),
          platform: social?.platform ?? null,
          host,
          provenance_tag_count: provenanceWarnings.length,
          matched_signal_id: matchedSignal?.id ?? null,
          matched_by: corroboration.matched_by,
          total_sources: sourceCount,
          credible_sources: credibleCount,
          systems_hit: corroboration.systems.filter((s) => s.status === 'hit').length,
          systems_queried: corroboration.systems.length,
        },
      });
    } catch {
      // telemetry is best-effort
    }
  }

  // Phase 8 — Reader Report. Translate the engine's output into the
  // plain-English structure every user-facing surface renders.
  const readerReport: ReaderReport = buildReaderReport({
    confidence: report,
    input: {
      kind: body.kind,
      canonical_url,
      host,
      headline: searchedTitle ?? title,
      preview_text: body.kind === 'text' ? body.text?.slice(0, 300) ?? null : null,
      is_social: Boolean(social),
      social_platform_label: social?.platform_label ?? null,
      image_filename: body.image_filename ?? null,
      has_image_hash: Boolean(body.image_sha256),
    },
    corroboration: {
      systems: corroboration.systems,
      matched_signal: matchedSignal
        ? {
            id: matchedSignal.id,
            title: matchedSignal.title,
            source_count: matchedSignal.source_count,
            credible_source_count: matchedSignal.credible_source_count,
          }
        : null,
    },
    provenance_limits: provenanceWarnings,
  });

  const response: VerifyResponse = {
    report,
    reader_report: readerReport,
    analysis: {
      ranked_sources: ranked,
      ranked_summary: rankedSummary,
      conflicts: analyzedConflicts,
      conflict_summary: conflictSummary,
      bias: corpusBias,
      evidence_cards: evidenceCards,
      cards_summary: cardsSummary,
      confidence_breakdown: breakdown,
      explanation: resultExplanation,
      case_file: caseFile,
      specialized_sources: specialized.systems,
    },
    input: {
      kind: body.kind,
      canonical_url,
      host,
      is_social: Boolean(social),
      platform: social?.platform ?? null,
      platform_label: social?.platform_label ?? null,
      preview_text: body.kind === 'text' ? body.text?.slice(0, 300) ?? null : null,
    },
    social,
    link,
    image,
    verification_id,
    case_id,
    corroboration: {
      matched_signal: matchedSignal,
      matched_by: corroboration.matched_by,
      total_sources: sourceCount,
      credible_sources: credibleCount,
      searched_title: searchedTitle,
      systems: corroboration.systems,
    },
  };
  return NextResponse.json(response);
}

/**
 * Dedupe EvidenceItems by canonical URL (case-insensitive). Preserves
 * insertion order so slot 0 (the user's own submission) stays primary.
 */
function dedupeByUrl(items: EvidenceItem[]): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  const seen = new Set<string>();
  for (const e of items) {
    const key = (e.url ?? '').toLowerCase().trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

async function persistCaseFile(
  sb: Awaited<ReturnType<typeof getServerSupabase>>,
  input: {
    userId: string;
    verificationId: string;
    caseFile: EvidenceCaseFile;
    inputKind: 'url' | 'text' | 'image';
    inputUrl: string | null;
    inputText: string | null;
  },
): Promise<string | null> {
  const { data: caseRow, error: caseErr } = await sb
    .from('verification_cases')
    .insert({
      user_id: input.userId,
      verification_id: input.verificationId,
      input_kind: input.inputKind,
      input_url: input.inputUrl,
      input_text: input.inputText,
      title: input.caseFile.title,
      overall_verdict: input.caseFile.overall_verdict,
      overall_band: input.caseFile.overall_band,
      overall_summary: input.caseFile.overall_summary,
      what_we_can_say: input.caseFile.what_we_can_say,
      what_remains_uncertain: input.caseFile.what_remains_uncertain,
      what_would_strengthen: input.caseFile.what_would_make_this_stronger,
      case_file: input.caseFile,
      status: 'ready',
    })
    .select('id')
    .single();

  if (caseErr || !caseRow) return null;
  const caseId = (caseRow as { id: string }).id;

  for (let i = 0; i < input.caseFile.claims.length; i += 1) {
    const claim = input.caseFile.claims[i]!;
    const { data: claimRow, error: claimErr } = await sb
      .from('verification_claims')
      .insert({
        case_id: caseId,
        claim_key: claim.claim.id,
        claim_text: claim.claim.text,
        normalized_text: claim.claim.normalized_text,
        claim_kind: claim.claim.kind,
        checkability: claim.claim.checkability,
        risk_level: claim.claim.risk_level,
        entities: claim.claim.entities,
        dates: claim.claim.dates,
        locations: claim.claim.locations,
        verdict_label: claim.verdict,
        confidence_band: claim.confidence_band,
        confidence_score: claim.confidence_score,
        support_count: claim.support_count,
        contradiction_count: claim.contradiction_count,
        context_count: claim.context_count,
        summary: claim.summary,
        uncertainty: claim.uncertainty,
        sort_order: i,
      })
      .select('id')
      .single();
    if (claimErr || !claimRow) continue;
    const claimId = (claimRow as { id: string }).id;
    const rows = claim.evidence.slice(0, 20).map((e) => ({
      claim_id: claimId,
      url: e.url,
      domain: e.domain,
      title: e.title,
      excerpt: e.excerpt,
      published_at: e.published_at,
      source_role: e.source_role,
      source_rank: e.source_rank,
      source_score: e.source_score,
      source_components: e.source_components,
      is_credible: e.is_credible,
      stance: e.stance,
      stance_confidence: e.stance_confidence,
      explanation: e.explanation,
      retrieved_via: e.retrieved_via,
    }));
    if (rows.length > 0) {
      await sb.from('claim_evidence').insert(rows);
    }
  }

  return caseId;
}

/**
 * Fetch any prior observation for this hash, then upsert a new / incremented
 * row. Returns the PRE-upsert snapshot so the caller can describe the image
 * as "first time seen" on a genuinely first submission.
 *
 * Runs under the service-role client — the table is intentionally cross-user
 * (sha256 is anonymous, shared dedup data), so no user-scoped writes apply.
 */
async function recordImageObservation(opts: {
  sha256: string;
  host: string | null;
}): Promise<ImageObservationSnapshot | null> {
  let admin: ReturnType<typeof getAdminSupabase>;
  try {
    admin = getAdminSupabase();
  } catch {
    // Service role not configured in this env — skip silently. The UI still
    // gets a full confidence report; we just cannot dedupe this time.
    return null;
  }

  const { data: priorRow } = await admin
    .from('image_observations')
    .select('first_seen_at,last_seen_at,observation_count,seen_hosts,first_host')
    .eq('sha256', opts.sha256)
    .maybeSingle();

  const prior: ImageObservationSnapshot | null = priorRow
    ? {
        first_seen_at: priorRow.first_seen_at,
        last_seen_at: priorRow.last_seen_at,
        observation_count: priorRow.observation_count,
        seen_hosts: priorRow.seen_hosts ?? [],
        first_host: priorRow.first_host ?? null,
      }
    : null;

  const now = new Date().toISOString();
  if (prior) {
    const seen = new Set(prior.seen_hosts);
    if (opts.host) seen.add(opts.host);
    const seenList = [...seen].slice(0, MAX_SEEN_HOSTS);
    await admin
      .from('image_observations')
      .update({
        last_seen_at: now,
        observation_count: prior.observation_count + 1,
        seen_hosts: seenList,
      })
      .eq('sha256', opts.sha256);
  } else {
    await admin.from('image_observations').insert({
      sha256: opts.sha256,
      first_seen_at: now,
      last_seen_at: now,
      observation_count: 1,
      seen_hosts: opts.host ? [opts.host] : [],
      first_host: opts.host,
      first_context: 'verify',
    });
  }
  return prior;
}
