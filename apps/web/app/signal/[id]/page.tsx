import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  analyzeConflicts,
  buildConfidenceBreakdown,
  buildConfidenceReport,
  buildEvidenceCards,
  buildResultExplanation,
  buildTrustExplanation,
  detectCorpusBias,
  physicalEvidencePhrase,
  rankSources,
  statusDescription,
  statusLabel,
  summarizeConflicts,
  summarizeEvidenceCards,
  summarizeRankedSources,
  type AnalyzedConflict,
  type ConfidenceBand,
  type ConfidenceBreakdown,
  type ConfidenceReport,
  type CorpusBiasReport,
  type DetectedContradiction,
  type EvidenceCard,
  type EvidenceItem,
  type PhysicalEvidence,
  type RankedSource,
  type ResultExplanation,
  type TrustExplanation,
  type VerificationStatus,
} from '@osint/core';
import { getAdminSupabase } from '@/lib/supabase-server';
import { VerifyAnalysis, type VerifyAnalysisData } from '@/components/verify-analysis';
import { Badge } from '@/components/ui/badge';
import { SeverityMeter } from '@/components/ui/severity-meter';
import { Disclosure } from '@/components/ui/disclosure';
import { SignalFeedbackButtons } from '@/components/signal-feedback';
import { DevelopStoryButton } from '@/components/develop-story';
import { prettyOutletName } from '@/lib/reader-report';

export const revalidate = 30;

type PageProps = { params: { id: string } };

export default async function SignalPage({ params }: PageProps) {
  const sb = getAdminSupabase();

  const [{ data: signal }, { data: enrichmentRow }, { data: evidence }, { data: contradictions }, { data: feedbackRows }] =
    await Promise.all([
      sb.from('signals_public').select('*').eq('id', params.id).maybeSingle(),
      sb.from('signals').select('last_enriched_at').eq('id', params.id).maybeSingle(),
      sb
        .from('evidence')
        .select('*')
        .eq('signal_id', params.id)
        .order('published_at', { ascending: false }),
      sb.from('contradictions').select('*').eq('signal_id', params.id),
      sb.from('feedback').select('kind').eq('signal_id', params.id),
    ]);

  if (!signal) notFound();

  const lastEnrichedAt =
    (enrichmentRow as { last_enriched_at: string | null } | null)?.last_enriched_at ?? null;

  // We don't enforce auth here — anonymous readers can still trigger the
  // live enrichment (it's per-IP rate limited). But only authenticated
  // users can bypass the per-signal cooldown with force=true.
  const { data: auth } = await sb.auth.getUser();
  const canForce = Boolean(auth?.user?.id);

  const contradictionsCount = (contradictions ?? []).length;
  const evidenceCount = (evidence ?? []).length;

  const fbHelp = (feedbackRows ?? []).filter((r: any) => r.kind === 'useful').length;
  const fbUnclear = (feedbackRows ?? []).filter((r: any) => r.kind === 'helpful_context').length;
  const fbWrong = (feedbackRows ?? []).filter((r: any) => r.kind === 'wrong').length;
  const fbTotal = fbHelp + fbUnclear + fbWrong;

  const physicalEvidence = extractPhysicalEvidence(signal.raw_data ?? null);
  const isComplexSignal = Array.isArray(signal.tags)
    ? (signal.tags as string[]).includes('complex_signal')
    : false;
  const detectionMeta = extractDetectionMeta(signal.raw_data ?? null);
  const complexSignalReason = detectionMeta?.reason ?? null;
  const complexSourceCount = detectionMeta?.source_count ?? null;
  const complexClaimCount = detectionMeta?.claim_count ?? null;

  // Phase 1 — unified confidence contract. The detail page is authoritative
  // because it has the full evidence and contradictions lists. Feed cards
  // use the same contract computed in lib/signals.ts.
  const evidenceItems: EvidenceItem[] = (evidence ?? []).map((e: any) => ({
    source_id: e.source_id ?? null,
    url: e.url,
    domain: e.domain,
    title: e.title ?? null,
    published_at: e.published_at ?? null,
    is_credible: Boolean(e.is_credible),
    excerpt: e.excerpt ?? null,
  }));
  const contradictionItems: DetectedContradiction[] = (contradictions ?? []).map((c: any) => ({
    type: (c.type ?? 'cause_conflict') as DetectedContradiction['type'],
    severity: (c.severity ?? 'medium') as DetectedContradiction['severity'],
    summary: c.summary ?? '',
    metadata: c.metadata ?? {},
    evidence_ids: Array.isArray(c.evidence_ids) ? c.evidence_ids : [],
  }));
  const report: ConfidenceReport = buildConfidenceReport({
    verification_status: signal.verification_status as VerificationStatus,
    reliability_score: signal.reliability_score ?? null,
    reliability_label: (signal.reliability_label as
      | 'LIKELY_ACCURATE'
      | 'UNCLEAR'
      | 'LIKELY_UNRELIABLE'
      | null) ?? null,
    evidence: evidenceItems,
    contradictions: contradictionItems,
    physical_evidence: physicalEvidence,
    source_count: signal.source_count ?? 0,
    credible_source_count: signal.credible_source_count ?? 0,
    complex_signal: isComplexSignal,
  });

  const bandTone = bandToneClasses(report.band);
  const bottomLine = bottomLineForSignal(
    report.band,
    signal.source_count ?? 0,
    signal.credible_source_count ?? 0,
    contradictionsCount,
    isComplexSignal,
  );

  // April 2026 evidence-comparison upgrade — pull the persisted analysis
  // off the row when present, otherwise compute it on the fly. The signal
  // detail page is authoritative because it has the FULL evidence and
  // contradictions list, so even the on-the-fly result is high quality.
  const analysisData = resolveSignalAnalysis(signal, evidenceItems, contradictionItems);

  // Build the trust explanation AFTER the analysis so we can fold the
  // broader conflict taxonomy + numeric severity + bias signal into the
  // existing trust hero without rendering a duplicate panel below.
  const trustExplanation: TrustExplanation = buildTrustExplanation({
    report,
    source_count: signal.source_count ?? 0,
    credible_source_count: signal.credible_source_count ?? 0,
    contradictions_count: contradictionsCount,
    contradiction_types: contradictionItems.map((c) => c.type),
    physical_evidence: physicalEvidence,
    syndicated: detectSyndicatedRepetition(evidence ?? []),
    complex_signal: isComplexSignal,
    title: signal.title,
    analyzed_conflicts: analysisData.conflicts,
    bias_report: analysisData.bias,
    confidence_breakdown: analysisData.confidence_breakdown,
  });
  return (
    <article className="space-y-4 sm:space-y-5">
      {/* Reader-first header: what happened → what we think about it →
          the technical chrome. The event title is the hero because it's
          the thing you're here to read; the verdict sits right below it
          as a tinted callout so you can't miss it. */}
      <header className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
        {/* Context chips — topic, country, status — kept small above the
            title so they set scene without dominating. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {signal.topic && (
            <Badge variant="topic" withIcon={false}>
              {signal.topic}
            </Badge>
          )}
          {signal.country_code && (
            <Badge variant="country" withIcon={false}>
              {signal.country_code}
            </Badge>
          )}
          <Badge
            variant={signal.verification_status}
            title="Reliability label — how well this event is corroborated across independent sources."
          >
            {statusLabel(signal.verification_status)}
          </Badge>
          {contradictionsCount > 0 && (
            <Badge variant="disputed">Sources disagree ({contradictionsCount})</Badge>
          )}
        </div>

        {/* Event title — the hero of this page. */}
        <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">
          {signal.title}
        </h1>
        {signal.summary && (
          <div className="mt-3 max-w-3xl space-y-2 text-[15px] leading-relaxed text-ink-600 sm:text-base">
            {cleanSummary(signal.summary).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        )}

        {/* Trust hero — the single block that tells you everything you
            need to know about how this story is being reported. Replaces
            the older verdict callout + "Here's why we're saying that"
            details (those duplicated this card and made the page noisy).
            The hero pulls its summary, framing chips, and structured
            sections directly from the deterministic trust explainer, so
            this surface is identical in language to the feed cards and
            the AI briefing prompt — by construction. */}
        <TrustHero
          signalId={signal.id}
          band={report.band}
          bandTone={bandTone}
          totalSourceCount={signal.source_count ?? 0}
          explanation={trustExplanation}
          bottomLine={bottomLine}
        />

        {/* Technical meta — the stuff most readers don't need to see first.
            Kept together as a subtle strip at the bottom of the header so
            analysts can scan it without the numbers competing with the
            verdict. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-100 pt-3 text-xs text-ink-500">
          <SeverityMeter severity={signal.severity} label="severity" size="md" />
          <span aria-hidden="true">·</span>
          <span>First seen {new Date(signal.first_seen_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>

        {fbTotal > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-500">
            <span className="font-medium text-ink-400">Community feedback:</span>
            {fbHelp > 0 && <span className="text-brand-600">{fbHelp} found helpful</span>}
            {fbWrong > 0 && <span className="text-danger-600">{fbWrong} flagged inaccurate</span>}
            {fbUnclear > 0 && <span className="text-amber-600">{fbUnclear} found unclear</span>}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SignalFeedbackButtons signalId={signal.id} />
          <ShareButton title={signal.title} signalId={signal.id} />
          <LearnMoreLinks title={signal.title} topic={signal.topic} />
        </div>
      </header>



      {/* April 2026 evidence-comparison panel — same component the
          /verify page uses. Adds: ranked sources with rationale,
          extended conflict taxonomy with numeric severity, bias signal
          (kept separate from the verdict), evidence cards with stance,
          confidence breakdown, and the four result explanation
          sections. Pulled from the persisted JSONB columns when the
          worker has populated them; otherwise computed live from the
          full evidence + contradictions list. */}
      <VerifyAnalysis data={analysisData} />

      <Disclosure id="why-shown" title="Why it’s shown" defaultOpen={true}>
        <ul className="space-y-2 text-sm text-ink-600">
          <li>
            This signal groups {signal.source_count} reports across {(signal.distinct_domains ?? []).length} distinct
            domains.
          </li>
          <li>
            Reliability label: <strong>{statusLabel(signal.verification_status)}</strong>.{' '}
            {statusDescription(signal.verification_status)}
          </li>
          <li>
            Severity is an analyst heuristic (0–100). Both are descriptive of the reporting, not
            predictive of outcomes.
          </li>
        </ul>
      </Disclosure>

      {/* Source-disagreement detail moved into the unified
          <VerifyAnalysis> panel above (Conflict analysis card). The
          panel surfaces the broader taxonomy + numeric severity, plus
          links each conflict back to the involved sources. We keep
          a small fallback note here only when detection was SKIPPED
          (signal too complex) — that's an editorially important
          message and lives nowhere else. */}
      {isComplexSignal && (
        <Disclosure
          id="source-disagreement"
          title="Source-disagreement detection skipped"
          defaultOpen={false}
          tone="warn"
          badge={<Badge variant="muted" withIcon={false}>Detection skipped</Badge>}
        >
          <div className="text-sm text-ink-600 space-y-2">
            <p>
              Source-disagreement detection was skipped for this signal because it exceeded the
              per-signal safety limits ({complexSignalReason === 'too_many_sources'
                ? `${complexSourceCount ?? 'many'} sources, cap is 20`
                : `${complexClaimCount ?? 'many'} claims, cap is 50`}).
              The evidence list below is complete and un-truncated — please review it directly
              instead of relying on the deterministic detector output.
            </p>
            <p className="text-xs text-ink-400">
              This is a cost- and performance-safety rail, not an editorial decision.
            </p>
          </div>
        </Disclosure>
      )}

      {/* Source trace — friendly role labels + pretty outlet names, no
          jargon like `[primary]`. The full evidence list is further down. */}
      <Disclosure id="sources" title={`Sources (${report.source_trace.length})`} defaultOpen={false}>
        <p className="text-xs text-ink-500">
          The sources that drove the verdict above, grouped by how they relate to the event.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {report.source_trace.map((t, i) => (
            <li
              key={`${t.url}-${i}`}
              className="flex items-start gap-3 rounded-xl border border-ink-100 bg-canvas-50 p-3"
            >
              <span
                className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider ${roleChipClass(t.role)}`}
              >
                {friendlyRoleLabel(t.role)}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={t.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-ink hover:text-amber-600 hover:underline"
                >
                  {t.title ?? prettyOutletName(t.domain)}
                </a>
                <div className="text-xs text-ink-400">
                  {prettyOutletName(t.domain)} · {t.domain}
                  {t.is_credible && <span className="ml-1.5 text-amber-600">· rated outlet</span>}
                  {t.published_at ? ` · ${new Date(t.published_at).toLocaleString()}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Disclosure>

      {physicalEvidence && (
        <Disclosure
          id="physical-evidence"
          title={`Physical evidence · ${physicalEvidence.status.replace('_', ' ')}`}
          defaultOpen={false}
        >
          <p className="text-xs text-ink-500">{physicalEvidencePhrase(physicalEvidence)}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-100 bg-canvas-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Sources ({physicalEvidence.sources.length})
              </p>
              <ul className="mt-1.5 space-y-0.5 text-sm">
                {physicalEvidence.sources.length === 0 ? (
                  <li className="text-ink-400">
                    No sensor networks contributed confirming data.
                  </li>
                ) : (
                  physicalEvidence.sources.map((src, i) => (
                    <li key={i} className="text-ink-700">
                      <span aria-hidden="true" className="mr-1.5 font-mono text-brand-600">
                        ✓
                      </span>
                      {src}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-xl border border-ink-100 bg-canvas-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Limitations ({physicalEvidence.limitations.length})
              </p>
              <ul className="mt-1.5 space-y-1 text-sm text-ink-600">
                {physicalEvidence.limitations.map((lim, i) => (
                  <li key={i}>
                    <span aria-hidden="true" className="mr-1.5 text-ink-300">
                      ·
                    </span>
                    {lim}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-ink-400">
            Confidence: {physicalEvidence.confidence}/100. &quot;No evidence detected&quot;
            describes sensor coverage for this window — it does not describe what happened.
          </p>
        </Disclosure>
      )}

      {signal.reliability_score != null && (
        <Disclosure
          id="advanced-reliability"
          title={`Advanced: reliability score (${signal.reliability_score}/100)`}
          defaultOpen={false}
        >
          <p className="text-xs text-ink-500">
            A composite of four signals about how this event is being reported. Pair it with the
            confidence band above for context.
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <ScoreRow
              label="Agreement"
              value={signal.agreement_score}
              hint="Share of sources that describe the event the same way."
            />
            <ScoreRow
              label="Source independence"
              value={signal.source_independence_score}
              hint="Distinct domains vs. total sources — penalises syndicated copies."
            />
            <ScoreRow
              label="Evidence strength"
              value={signal.evidence_strength_score}
              hint="USGS / NASA-EONET sensor matches plus 4+ rated outlets."
            />
            <ScoreRow
              label="Narrative divergence"
              value={signal.narrative_divergence_score}
              hint="Number of source disagreements × 25, capped at 100 (lower is better)."
              danger
            />
          </dl>
        </Disclosure>
      )}

      {/* Develop-the-story — runs the same live corroboration fan-out
          the /verify page uses against this signal, pulling in fresh
          sources the ingest adapters haven't caught yet. */}
      <DevelopStoryButton
        signalId={signal.id}
        lastEnrichedAt={lastEnrichedAt}
        canForce={canForce}
      />

      <Disclosure id="all-evidence" title={`All evidence (${evidenceCount})`} defaultOpen={false}>
        {evidenceCount === 0 ? (
          <p className="text-sm text-ink-400">No evidence rows yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(evidence ?? []).map((e: any) => {
              const liveLabel = liveDiscoveryLabel(e.discovered_via);
              return (
                <li
                  key={e.id}
                  className="flex items-start gap-3 rounded-xl border border-ink-100 bg-canvas-50 p-3"
                >
                  <Badge variant={e.is_credible ? 'verified' : 'neutral'} withIcon={false}>
                    {e.is_credible ? 'Rated outlet' : 'Unrated'}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-ink hover:text-amber-600 hover:underline"
                    >
                      {e.title ?? e.url}
                    </a>
                    <div className="text-xs text-ink-400">
                      {prettyOutletName(e.domain)} · {e.domain}
                      {e.published_at ? ` · ${new Date(e.published_at).toLocaleString()}` : ''}
                    </div>
                    {liveLabel && (
                      <span
                        className="mt-1.5 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700"
                        title="Surfaced by the live corroboration fan-out (the same pipeline the /verify page uses), after this signal was clustered."
                      >
                        {liveLabel}
                      </span>
                    )}
                    {e.excerpt && <p className="mt-1 text-ink-600">{e.excerpt}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Disclosure>
    </article>
  );
}

/**
 * Read the persisted evidence-comparison analysis off the signal row,
 * or compute it on the fly when older rows lack the persisted JSONB
 * blobs (analysis_version === null). The compute path uses the FULL
 * evidence + contradictions list this page already loads, so it's
 * lossless compared to the worker's pre-computed version.
 */
function resolveSignalAnalysis(
  signal: any,
  evidence: EvidenceItem[],
  contradictions: DetectedContradiction[],
): VerifyAnalysisData {
  if (
    signal?.analysis_version != null &&
    signal.ranked_sources &&
    signal.analyzed_conflicts &&
    signal.bias_report &&
    signal.evidence_cards &&
    signal.confidence_breakdown &&
    signal.result_explanation
  ) {
    return {
      ranked_sources: signal.ranked_sources as RankedSource[],
      ranked_summary: summarizeRankedSources(signal.ranked_sources as RankedSource[]),
      conflicts: signal.analyzed_conflicts as AnalyzedConflict[],
      conflict_summary: summarizeConflicts(signal.analyzed_conflicts as AnalyzedConflict[]),
      bias: signal.bias_report as CorpusBiasReport,
      evidence_cards: signal.evidence_cards as EvidenceCard[],
      cards_summary: summarizeEvidenceCards(signal.evidence_cards as EvidenceCard[]),
      confidence_breakdown: signal.confidence_breakdown as ConfidenceBreakdown,
      explanation: signal.result_explanation as ResultExplanation,
    };
  }
  // Compute live. Pure / deterministic / LLM-free / network-free, so
  // safe to run on every render of an un-migrated signal.
  const ranked = rankSources({ evidence, anchor_url: signal?.url ?? null });
  const ranked_summary = summarizeRankedSources(ranked);
  const conflicts = analyzeConflicts({
    contradictions,
    evidence,
    claim_title: signal?.title,
    claim_text: signal?.summary ?? null,
  });
  const conflict_summary = summarizeConflicts(conflicts);
  const evidence_cards = buildEvidenceCards({ evidence, ranked, contradictions });
  const cards_summary = summarizeEvidenceCards(evidence_cards);
  const bias = detectCorpusBias(
    evidence.map((e) => `${e.title ?? ''} ${e.excerpt ?? ''}`),
  );
  const confidence_breakdown = buildConfidenceBreakdown({
    ranked,
    ranked_summary,
    conflicts,
    conflict_summary,
    cards_summary,
    has_anchor: Boolean(signal?.url),
    is_text_only: false,
    cap_at_medium: false,
  });
  const explanation = buildResultExplanation({
    band: confidence_breakdown.band,
    breakdown: confidence_breakdown,
    ranked_summary,
    conflicts,
    conflict_summary,
    cards_summary,
    has_anchor: Boolean(signal?.url),
    is_text_only: false,
    is_social: false,
  });
  return {
    ranked_sources: ranked,
    ranked_summary,
    conflicts,
    conflict_summary,
    bias,
    evidence_cards,
    cards_summary,
    confidence_breakdown,
    explanation,
  };
}

function bandDotClass(band: ConfidenceBand): string {
  switch (band) {
    case 'high':
      return 'bg-brand-500';
    case 'medium':
      return 'bg-warn-500';
    case 'contested':
      return 'bg-danger-500';
    case 'low':
      return 'bg-ink-300';
  }
}

/** Colours for the hero verdict callout — mirrors the same helper the
 * /verify page uses so both surfaces read the same visually. */
function bandToneClasses(band: ConfidenceBand): { wrap: string; label: string } {
  switch (band) {
    case 'high':
      return { wrap: 'border-emerald-200 bg-emerald-50/80', label: 'text-emerald-700' };
    case 'contested':
      return { wrap: 'border-danger-200 bg-danger-50/80', label: 'text-danger-700' };
    case 'medium':
      return { wrap: 'border-amber-200 bg-amber-50/80', label: 'text-amber-700' };
    case 'low':
    default:
      return { wrap: 'border-ink-200 bg-canvas-50', label: 'text-ink-600' };
  }
}

function friendlyRoleLabel(role: 'primary' | 'corroborating' | 'conflicting' | 'sensor'): string {
  switch (role) {
    case 'primary':
      return 'Main report';
    case 'corroborating':
      return 'Backs this up';
    case 'conflicting':
      return 'Disagrees';
    case 'sensor':
      return 'Sensor network';
  }
}

function roleChipClass(role: 'primary' | 'corroborating' | 'conflicting' | 'sensor'): string {
  switch (role) {
    case 'primary':
      return 'bg-amber-100 text-amber-800';
    case 'corroborating':
      return 'bg-emerald-100 text-emerald-800';
    case 'conflicting':
      return 'bg-danger-100 text-danger-700';
    case 'sensor':
      return 'bg-sky-100 text-sky-800';
  }
}

/**
 * Plain-English recommendation for what to do with a tracked event. This is
 * the signal-detail analog of the verify flow's bottom-line block.
 */
function bottomLineForSignal(
  band: ConfidenceBand,
  sourceCount: number,
  _credibleSourceCount: number,
  contradictionsCount: number,
  isComplexSignal: boolean,
): string {
  // Guiding principle: describe all-source corroboration shape, not a
  // source-tier verdict.
  if (contradictionsCount > 0) {
    return 'Sources disagree on important details. Read both sides carefully before sharing specific claims.';
  }
  if (isComplexSignal) {
    return 'This event has many sources and moving parts. Our automatic disagreement detection was skipped — review the evidence list below before relying on any single claim.';
  }
  switch (band) {
    case 'high':
      return sourceCount >= 2
        ? `${sourceCount} independent sources are reporting this. The basic shape of the event is well-supported.`
        : 'Multiple independent sources are reporting this. The basic shape of the event is well-supported.';
    case 'medium':
      if (sourceCount >= 5) {
        return `${sourceCount} independent sources are reporting this. Promising, but check each one before trusting specifics.`;
      }
      return 'This is still developing. The basic shape looks real, but specific claims need more corroboration.';
    case 'contested':
      return 'Sources are giving conflicting accounts. The underlying event may still be real — hold off on sharing specifics until it settles.';
    case 'low':
      if (sourceCount === 0) {
        return 'We haven\u2019t found anyone reporting this yet. Treat as unconfirmed until more sources surface.';
      }
      if (sourceCount === 1) {
        return 'We\u2019ve only found one source so far. Read it directly, check who wrote it, and watch for others picking it up.';
      }
      return `${sourceCount} sources are reporting this. Read them yourself before treating any specifics as confirmed.`;
  }
}

/**
 * Friendly label for evidence rows surfaced by the live corroboration
 * fan-out. Rows added by the ingest worker have `discovered_via = null`
 * (historic) or not set, and get no badge.
 */
function liveDiscoveryLabel(discoveredVia: string | null | undefined): string | null {
  if (!discoveredVia || typeof discoveredVia !== 'string') return null;
  if (!discoveredVia.startsWith('live_')) return null;
  const tail = discoveredVia.slice('live_'.length);
  switch (tail) {
    case 'web':
      return 'Found live · web search';
    case 'reddit':
      return 'Found live · Reddit';
    case 'bluesky':
      return 'Found live · Bluesky';
    case 'wikipedia':
      return 'Found live · Wikipedia';
    case 'gdelt':
      return 'Found live · GDELT global news';
    case 'sensors':
      return 'Found live · sensor network';
    case 'tracked_events':
      return 'Found live · tracked events';
    case 'polymarket':
      return 'Found live · Polymarket';
    default:
      return 'Found live';
  }
}

function ShareButton({ title, signalId }: { title: string; signalId: string }) {
  const url = `/signal/${signalId}`;
  return (
    <a
      href={url}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-ink-100 bg-paper px-3 py-1.5 text-xs text-ink-600 hover:border-ink-200 hover:text-ink"
    >
      Share this result
    </a>
  );
}

function extractDetectionMeta(
  raw: Record<string, unknown> | null,
): {
  skipped: boolean;
  reason: 'too_many_sources' | 'too_many_claims' | null;
  source_count: number | null;
  claim_count: number | null;
} | null {
  if (!raw) return null;
  const meta = raw.contradiction_detection;
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  const reason =
    m.reason === 'too_many_sources' || m.reason === 'too_many_claims' ? m.reason : null;
  return {
    skipped: Boolean(m.skipped),
    reason,
    source_count: typeof m.source_count === 'number' ? m.source_count : null,
    claim_count: typeof m.claim_count === 'number' ? m.claim_count : null,
  };
}

function extractPhysicalEvidence(
  raw: Record<string, unknown> | null,
): PhysicalEvidence | null {
  if (!raw) return null;
  const pe = raw.physical_evidence;
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

/**
 * Clean up raw RSS/adapter summary text into readable paragraphs.
 *
 * Ingested summaries are often messy: prefixed with "Country: X Source: Y
 * Please refer to the attached file. Overview The following overview has
 * been generated..." or full of inline metadata tags. This strips that
 * cruft and splits into natural paragraphs.
 */
function cleanSummary(raw: string): string[] {
  let text = raw;

  text = text.replace(
    /^(?:Country:\s*\S+\s*)?(?:Source:\s*[^.]+\.?\s*)?(?:Please refer to the attached file\.?\s*)?(?:Overview\s*)?(?:The following (?:overview|summary|report) (?:has been|was) (?:generated|compiled|prepared) (?:using |based on )?(?:the )?(?:information |data )?(?:available )?(?:up to|as of|through)?\s*[^.]*\.?\s*)?(?:It provides a synthesized summary and key insights[^.]*\.?\s*)?/i,
    '',
  );

  text = text.replace(/^Summary\s+/i, '');
  text = text.replace(/^(?:Key (?:Insights|Findings|Points|Takeaways):\s*)/i, '');

  text = text.replace(/\s{2,}/g, ' ').trim();

  if (!text) return [];

  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [text];

  const paragraphs: string[] = [];
  let current = '';
  const TARGET_LENGTH = 280;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (current.length + trimmed.length > TARGET_LENGTH && current.length > 0) {
      paragraphs.push(current.trim());
      current = trimmed;
    } else {
      current += (current ? ' ' : '') + trimmed;
    }
  }
  if (current.trim()) paragraphs.push(current.trim());

  return paragraphs.length > 0 ? paragraphs : [text];
}

function ScoreRow({
  label,
  value,
  hint,
  danger = false,
}: {
  label: string;
  value: number | null | undefined;
  hint: string;
  danger?: boolean;
}) {
  const shown = typeof value === 'number' ? value : null;
  const tone = danger
    ? 'bg-danger-500'
    : shown != null && shown >= 65
      ? 'bg-brand-500'
      : shown != null && shown >= 35
        ? 'bg-amber-500'
        : 'bg-ink-200';
  return (
    <div className="rounded-xl border border-ink-100 bg-canvas-50 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-xs uppercase tracking-wider text-ink-500">{label}</dt>
        <dd className="font-mono text-sm text-ink-700">{shown ?? '—'}/100</dd>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full ${tone}`}
          style={{ width: shown != null ? `${Math.max(0, Math.min(100, shown))}%` : '0%' }}
        />
      </div>
      <p className="mt-2 text-[11px] text-ink-400">{hint}</p>
    </div>
  );
}

function LearnMoreLinks({ title, topic }: { title: string; topic: string | null }) {
  const query = encodeURIComponent(title.slice(0, 120));
  const wikiQuery = encodeURIComponent(
    (topic && topic !== 'other' ? `${topic} ` : '') + title.split(/\s+/).slice(0, 6).join(' '),
  );
  return (
    <details className="group w-full">
      <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 rounded-full border border-ink-100 bg-paper px-3 py-1.5 text-xs text-ink-600 hover:border-ink-200 hover:text-ink">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
        </svg>
        Learn more about this
        <span className="text-ink-400 transition-transform group-open:rotate-180" aria-hidden="true">&#8964;</span>
      </summary>
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={`https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-canvas-50 px-3 py-1.5 text-xs text-ink-600 hover:border-ink-200 hover:text-ink"
        >
          <span>Google News</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
        </a>
        <a
          href={`https://en.wikipedia.org/w/index.php?search=${wikiQuery}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-canvas-50 px-3 py-1.5 text-xs text-ink-600 hover:border-ink-200 hover:text-ink"
        >
          <span>Wikipedia</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
        </a>
        <a
          href={`https://www.reuters.com/search/news?query=${query}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-canvas-50 px-3 py-1.5 text-xs text-ink-600 hover:border-ink-200 hover:text-ink"
        >
          <span>Reuters</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
        </a>
        <a
          href={`https://apnews.com/search#?q=${query}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-canvas-50 px-3 py-1.5 text-xs text-ink-600 hover:border-ink-200 hover:text-ink"
        >
          <span>AP News</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
        </a>
      </div>
    </details>
  );
}

/**
 * Trust hero — single, high-density block that replaces the older
 * verdict callout + "Here's why we're saying that" details.
 *
 * Layout (top → bottom):
 *   1. Verdict line (band-tinted) with the explainer summary, source
 *      count, and glanceable framing chips.
 *   2. Three structured sections — What is widely supported, What is
 *      disputed or unclear, What to watch — driven by the explainer.
 *   3. "Watch for" hint where the explainer provided one.
 *   4. Action row: "Ask the analyst about this story" pre-fills the AI
 *      workspace with the explainer's suggested prompt; "Learn more"
 *      pills jump to the relevant in-page section or `/trust`.
 *
 * Every line on this surface comes from the deterministic explainer,
 * which means it is identical to what the feed card and the AI briefing
 * prompt see — and the forbidden-phrase test in core/__tests__ covers
 * everything the reader sees here.
 */
function TrustHero({
  signalId,
  band,
  bandTone,
  totalSourceCount,
  explanation,
  bottomLine,
}: {
  signalId: string;
  band: ConfidenceBand;
  bandTone: { wrap: string; label: string };
  totalSourceCount: number;
  explanation: TrustExplanation;
  bottomLine: string;
}) {
  return (
    <section className={`mt-4 rounded-2xl border p-4 sm:p-5 ${bandTone.wrap}`}>
      {/* Verdict line. */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${bandDotClass(band)}`}
        />
        <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${bandTone.label}`}>
          {bottomLineLabelForBand(band)}
        </p>
        <span className="ml-auto text-[11px] text-ink-500">
          {totalSourceCount} source{totalSourceCount === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink sm:text-base">
        {explanation.summary || bottomLine}
      </p>

      {/* Glanceable framing chips. Each chip carries an optional `hint`
          that explains the label in plain English — important for chips
          like "Same article republished" where a normal reader needs to
          know what we mean. The hint surfaces as a hover tooltip + an
          explicit aria-label for screen readers, and the chip shows a
          tiny "?" affordance so it's obvious there is more info. */}
      {explanation.headline_chips.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {explanation.headline_chips.map((c, i) => {
            const className = `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${chipToneClass(c.tone)}`;
            const inner = (
              <>
                <span>{c.label}</span>
                {c.hint && (
                  <span
                    aria-hidden="true"
                    className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white/60 text-[9px] font-bold text-ink-600"
                  >
                    ?
                  </span>
                )}
              </>
            );
            const aria = c.hint ? `${c.label}. ${c.hint}` : c.label;
            return (
              <li key={i}>
                {c.href ? (
                  <a href={c.href} title={c.hint} aria-label={aria} className={className}>
                    {inner}
                  </a>
                ) : (
                  <span title={c.hint} aria-label={aria} className={className}>
                    {inner}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Structured supported / disputed / unclear sections. Mirror the
          briefing prompt's structure so the analyst voice is consistent
          across surfaces. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <TrustSection
          title="What is widely supported"
          tone="support"
          items={explanation.whats_supported}
          empty="Not enough independent reporting yet to call anything widely supported."
        />
        <TrustSection
          title="What is disputed or unclear"
          tone="dispute"
          items={explanation.whats_disputed}
          empty="No source disagreements have been detected for this signal."
        />
        <TrustSection
          title="What to watch"
          tone="watch"
          items={explanation.whats_unclear}
          empty="Nothing specific to watch for at this time."
        />
      </div>

      {/* Watch-for nudge — concrete, single-sentence, only rendered when
          the explainer has something to say. */}
      {explanation.watch_for && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13.5px] text-ink-700 sm:text-sm">
          <span className="mr-1.5 font-semibold uppercase tracking-wider text-amber-700 text-[10px]">
            Watch for
          </span>
          {explanation.watch_for}
        </p>
      )}

      {/* Bias-signal hint — strictly separate from the verdict, always
          carries the "signal not a verdict" qualifier. Rendered INSIDE
          the trust hero so a reader sees it next to the verdict and
          knows the band did not move because of it. */}
      {explanation.bias_hint && (
        <p className="mt-2 rounded-xl border border-ink-100 bg-canvas-50 px-3 py-2 text-[13px] text-ink-600">
          <span className="mr-1.5 font-semibold uppercase tracking-wider text-ink-500 text-[10px]">
            Bias signal
          </span>
          {explanation.bias_hint}
        </p>
      )}

      {/* Action row — the AI shortcut + the deterministic learn-more
          pills. Putting them together tells the user that the analyst
          and the methodology page are continuations of THIS surface. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/dashboard/ai?signal=${encodeURIComponent(signalId)}&prompt=${encodeURIComponent(explanation.suggested_prompt)}`}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_6px_16px_-4px_rgba(245,158,11,0.55)] transition hover:bg-amber-600"
        >
          <span aria-hidden="true">✨</span>
          Ask the analyst about this story
        </Link>
        {explanation.learn_more.map((link, i) => (
          <a
            key={`${link.href}-${i}`}
            href={link.href}
            title={link.hint}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-ink-100 bg-paper px-3 py-1.5 text-xs text-ink-600 hover:border-ink-200 hover:text-ink"
          >
            {link.label}
          </a>
        ))}
      </div>

      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-ink-400">
        LLM-free trust summary · AI is opt-in via the analyst button
      </p>
    </section>
  );
}

function TrustSection({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: 'support' | 'dispute' | 'watch';
  items: string[];
  empty: string;
}) {
  const toneClass =
    tone === 'support'
      ? 'border-emerald-200 bg-emerald-50/70'
      : tone === 'dispute'
        ? 'border-danger-200 bg-danger-50/70'
        : 'border-ink-100 bg-canvas-50';
  const labelTone =
    tone === 'support'
      ? 'text-emerald-700'
      : tone === 'dispute'
        ? 'text-danger-700'
        : 'text-ink-500';
  const dotTone =
    tone === 'support'
      ? 'bg-emerald-500'
      : tone === 'dispute'
        ? 'bg-danger-500'
        : 'bg-amber-500';
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneClass}`}>
      <p className={`text-[10.5px] font-semibold uppercase tracking-[0.16em] ${labelTone}`}>
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-1.5 text-[12.5px] text-ink-500">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-ink-700 sm:text-[13px]">
          {items.map((item, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden="true" className={`mt-[6px] h-1 w-1 shrink-0 rounded-full ${dotTone}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function chipToneClass(tone: 'support' | 'dispute' | 'caution' | 'sensor' | 'neutral'): string {
  switch (tone) {
    case 'support':
      return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200';
    case 'dispute':
      return 'bg-danger-100 text-danger-700 hover:bg-danger-200';
    case 'caution':
      return 'bg-amber-100 text-amber-800 hover:bg-amber-200';
    case 'sensor':
      return 'bg-sky-100 text-sky-800 hover:bg-sky-200';
    case 'neutral':
    default:
      return 'bg-ink-100 text-ink-700 hover:bg-ink-200';
  }
}

function bottomLineLabelForBand(band: ConfidenceBand): string {
  switch (band) {
    case 'high':
      return 'WIDELY SUPPORTED';
    case 'medium':
      return 'STILL DEVELOPING';
    case 'low':
      return 'LIMITED REPORTING';
    case 'contested':
      return 'SOURCES DISAGREE';
  }
}

/**
 * Heuristic syndication detector for the trust explainer.
 *
 * Real syndication detection lives in the corroboration scorer, but the
 * explainer just needs a coarse "are most evidence rows from the same
 * domain?" hint. We return true when 3+ rows share a domain or when the
 * total domain count is < 1/3 of total rows (a strong sign the same wire
 * report is being repeated). Cheap, deterministic, no LLM.
 */
function detectSyndicatedRepetition(
  evidenceRows: Array<{ domain?: string | null }>,
): boolean {
  if (!Array.isArray(evidenceRows) || evidenceRows.length < 4) return false;
  const counts = new Map<string, number>();
  for (const row of evidenceRows) {
    const d = (row.domain ?? '').toLowerCase().replace(/^www\./, '');
    if (!d) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const distinct = counts.size;
  const max = [...counts.values()].reduce((m, n) => (n > m ? n : m), 0);
  if (max >= 3) return true;
  if (distinct > 0 && distinct * 3 < evidenceRows.length) return true;
  return false;
}
