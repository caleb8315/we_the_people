'use client';

import { useState } from 'react';
import type {
  AnalyzedConflict,
  AnalyzedConflictType,
  ClaimCaseFile,
  ClaimEvidenceStance,
  ConfidenceBreakdown,
  CorpusBiasReport,
  EvidenceCard,
  EvidenceCaseFile,
  EvidenceCardSummary,
  EvidenceStance,
  ClaimVerdict,
  RankedSource,
  RankedSourceSummary,
  ResultExplanation,
} from '@osint/core';
import { prettyOutletName } from '@/lib/reader-report';

/**
 * The April 2026 evidence-comparison panel.
 *
 * Renders the new analysis the API now returns alongside the legacy
 * `report` / `reader_report` shapes:
 *
 *   - confidence breakdown (4 components + composite + penalties)
 *   - "Why this result?" / "What would resolve this?" / agree / disagree
 *   - ranked sources with per-source rationale
 *   - conflict cards (extended taxonomy + numeric severity)
 *   - bias signal layer (kept visually separate from confidence)
 *   - evidence cards with stance
 *
 * UX intent: scannable. Every section opens clearly labelled, no jargon,
 * evidence-rich without overflowing. Bias copy stays separate from the
 * truth/comparison verdict per the upgrade plan.
 */

export interface VerifyAnalysisData {
  ranked_sources: RankedSource[];
  ranked_summary: RankedSourceSummary;
  conflicts: AnalyzedConflict[];
  conflict_summary: {
    total: number;
    by_type: Record<AnalyzedConflictType, number>;
    worst_severity: number;
    only_insufficient: boolean;
  };
  bias: CorpusBiasReport;
  evidence_cards: EvidenceCard[];
  cards_summary: EvidenceCardSummary;
  confidence_breakdown: ConfidenceBreakdown;
  explanation: ResultExplanation;
  case_file?: EvidenceCaseFile;
  specialized_sources?: Array<{
    id: string;
    name: string;
    status: 'hit' | 'miss' | 'skipped' | 'unavailable' | 'error';
    hits: number;
    note: string;
    evidence_count: number;
  }>;
}

export function VerifyAnalysis({ data }: { data: VerifyAnalysisData }) {
  return (
    <section className="space-y-5">
      {data.case_file && <CaseFileCard caseFile={data.case_file} />}
      {data.specialized_sources && data.specialized_sources.length > 0 && (
        <SpecializedSourcesCard systems={data.specialized_sources} />
      )}
      <ConfidenceBreakdownCard breakdown={data.confidence_breakdown} />
      <ResultExplanationCard explanation={data.explanation} />
      <ConflictsCard conflicts={data.conflicts} summary={data.conflict_summary} />
      <BiasCard bias={data.bias} />
      <RankedSourcesCard sources={data.ranked_sources} />
      <EvidenceCardsList cards={data.evidence_cards} summary={data.cards_summary} />
    </section>
  );
}

/* ─── Case file: claim-level evidence OS ───────────────────────────────── */

function CaseFileCard({ caseFile }: { caseFile: EvidenceCaseFile }) {
  return (
    <article className="rounded-card border border-brand-200 bg-brand-500/[0.06] p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">
            Crosscheck case file
          </p>
          <h3 className="mt-1 max-w-3xl text-lg font-semibold text-ink sm:text-xl">
            {caseFile.overall_summary}
          </h3>
          <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-600">
            We split the submission into checkable claims, then mapped source evidence to each claim.
            The verdict is evidence-bound and claim-by-claim, with unresolved gaps called out explicitly.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${verdictClass(caseFile.overall_verdict)}`}>
          {verdictDisplay(caseFile.overall_verdict)}
        </span>
      </header>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <CaseFileMiniBlock title="What we can say" tone="good" items={caseFile.what_we_can_say} />
        <CaseFileMiniBlock title="Still uncertain" tone="warn" items={caseFile.what_remains_uncertain} />
        <CaseFileMiniBlock title="Would strengthen this" tone="info" items={caseFile.what_would_make_this_stronger} />
      </div>

      <div className="mt-5 space-y-3">
        {caseFile.claims.map((claim, idx) => (
          <ClaimCaseCard key={claim.claim.id} claim={claim} index={idx} />
        ))}
      </div>
    </article>
  );
}

function CaseFileMiniBlock({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'good' | 'warn' | 'info';
}) {
  const dot = tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div className="rounded-xl border border-ink-100 bg-paper/80 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{title}</p>
      <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-ink-700">
        {(items.length > 0 ? items : ['No strong signal in this section yet.']).slice(0, 4).map((item, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden="true" className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClaimCaseCard({ claim, index }: { claim: ClaimCaseFile; index: number }) {
  const topEvidence = claim.evidence.slice(0, 4);
  return (
    <section className="rounded-2xl border border-ink-100 bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Claim {index + 1} · {claim.claim.kind} · {claim.claim.checkability.replace('_', ' ')}
          </p>
          <h4 className="mt-1 text-sm font-semibold leading-relaxed text-ink-800">
            {claim.claim.text}
          </h4>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">{claim.summary}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${verdictClass(claim.verdict)}`}>
            {verdictDisplay(claim.verdict)}
          </span>
          <span className="text-[11px] text-ink-500">
            {claim.confidence_score}/100 · {claim.confidence_band}
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        <MetricPill label="Supports" value={claim.support_count} tone="good" />
        <MetricPill label="Contradicts" value={claim.contradiction_count} tone="warn" />
        <MetricPill label="Context" value={claim.context_count} tone="info" />
      </div>

      {topEvidence.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Strongest mapped evidence
          </p>
          <ul className="mt-2 space-y-2">
            {topEvidence.map((e) => (
              <li key={`${claim.claim.id}-${e.url}`} className="rounded-xl border border-ink-100 bg-canvas-50 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-700 underline-offset-2 hover:underline"
                  >
                    {e.title || prettyOutletName(e.domain)}
                  </a>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stanceClass(e.stance)}`}>
                    {stanceDisplay(e.stance)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink-500">
                  {prettyOutletName(e.domain)}{e.source_role ? ` · ${e.source_role}` : ''}{typeof e.source_score === 'number' ? ` · source ${e.source_score}/100` : ''}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">{e.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ClaimUncertainty claim={claim} />
    </section>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'info';
}) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-brand-700';
  return (
    <div className="rounded-xl border border-ink-100 bg-canvas-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function ClaimUncertainty({ claim }: { claim: ClaimCaseFile }) {
  const items = [
    ...claim.uncertainty.missing_evidence,
    ...claim.uncertainty.conflicting_evidence,
    ...claim.uncertainty.weak_points,
    ...claim.uncertainty.not_fact_checkable_reasons,
  ].slice(0, 4);
  if (items.length === 0 && claim.uncertainty.what_would_resolve.length === 0) return null;
  return (
    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
      {items.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Uncertainty</p>
          <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-ink-700">
            {items.map((item, i) => <li key={i}>• {item}</li>)}
          </ul>
        </div>
      )}
      {claim.uncertainty.what_would_resolve.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-500/[0.06] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-700">What would resolve this</p>
          <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-ink-700">
            {claim.uncertainty.what_would_resolve.slice(0, 3).map((item, i) => <li key={i}>• {item}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─── Specialized source coverage ──────────────────────────────────────── */

function SpecializedSourcesCard({
  systems,
}: {
  systems: NonNullable<VerifyAnalysisData['specialized_sources']>;
}) {
  const hits = systems.filter((s) => s.status === 'hit').length;
  const unavailable = systems.filter((s) => s.status === 'unavailable').length;
  return (
    <article className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-400">
            Deep source coverage
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink sm:text-xl">
            {hits} specialized source{hits === 1 ? '' : 's'} found matching records
          </h3>
        </div>
        {unavailable > 0 && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
            {unavailable} need free API setup
          </span>
        )}
      </header>
      <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-600">
        These are claim-specific searches across fact-check, scholarly, legal, finance, and cyber databases.
        They add evidence only; the case-file engine still decides how each source maps to each claim.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {systems.map((s) => (
          <li key={s.id} className="rounded-xl border border-ink-100 bg-canvas-50 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-ink-700">{s.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${systemStatusClass(s.status)}`}>
                {s.status}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-500">
              {s.evidence_count} evidence item{s.evidence_count === 1 ? '' : 's'}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-600">{s.note}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ─── Confidence breakdown ─────────────────────────────────────────────── */

function ConfidenceBreakdownCard({ breakdown }: { breakdown: ConfidenceBreakdown }) {
  return (
    <article className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-400">
            Confidence breakdown
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink sm:text-xl">
            {breakdown.composite}/100 · {bandFriendly(breakdown.band)}
          </h3>
        </div>
        <p className="text-[11px] text-ink-500">
          The score is built from four components — never a single overall guess.
        </p>
      </header>

      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <BreakdownRow label="Source agreement" component={breakdown.components.source_agreement} />
        <BreakdownRow label="Source quality" component={breakdown.components.source_quality} />
        <BreakdownRow label="Claim directness" component={breakdown.components.claim_directness} />
        <BreakdownRow label="Evidence completeness" component={breakdown.components.evidence_completeness} />
      </ul>

      {breakdown.penalty_reasons.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
            Penalties applied · −{breakdown.penalty}
          </p>
          <ul className="mt-1.5 space-y-1 text-[13px] text-ink-700">
            {breakdown.penalty_reasons.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function BreakdownRow({
  label,
  component,
}: {
  label: string;
  component: { score: number; reasons: string[] };
}) {
  return (
    <li className="rounded-xl border border-ink-100 bg-canvas-50 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink-700">{label}</p>
        <p className="text-sm font-semibold text-ink-700 tabular-nums">{component.score}/100</p>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full transition-all ${scoreBarClass(component.score)}`}
          style={{ width: `${component.score}%` }}
        />
      </div>
      {component.reasons.length > 0 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
          {component.reasons[0]}
        </p>
      )}
    </li>
  );
}

/* ─── Result explanation ───────────────────────────────────────────────── */

function ResultExplanationCard({ explanation }: { explanation: ResultExplanation }) {
  return (
    <article className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-400">
        Plain-English explanation
      </p>
      <p className="mt-2 max-w-prose text-[13.5px] italic leading-relaxed text-ink-600">
        {explanation.positioning}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ExplainBlock title="Why this result?" tone="info" bullets={explanation.why_this_result} />
        <ExplainBlock
          title="What would resolve this?"
          tone="info"
          bullets={explanation.what_would_resolve_this}
        />
        <ExplainBlock
          title="What sources agree on"
          tone="good"
          bullets={explanation.what_sources_agree_on}
        />
        <ExplainBlock
          title="What sources disagree on"
          tone="warn"
          bullets={explanation.what_sources_disagree_on}
        />
      </div>
    </article>
  );
}

function ExplainBlock({
  title,
  tone,
  bullets,
}: {
  title: string;
  tone: 'info' | 'good' | 'warn';
  bullets: string[];
}) {
  if (bullets.length === 0) return null;
  const dotClass = tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-ink-300';
  return (
    <div className="rounded-xl border border-ink-100 bg-canvas-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {title}
      </p>
      <ul className="mt-1.5 space-y-1.5 text-[13.5px] leading-relaxed text-ink-700">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden="true" className={`mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
            <span>{renderEmphasis(b)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Minimal `**bold**` renderer — keeps the explanation-builder simple. */
function renderEmphasis(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

/* ─── Conflicts (extended taxonomy + numeric severity) ─────────────────── */

function ConflictsCard({
  conflicts,
  summary,
}: {
  conflicts: AnalyzedConflict[];
  summary: VerifyAnalysisData['conflict_summary'];
}) {
  if (conflicts.length === 0) {
    return (
      <article className="rounded-card border border-emerald-200 bg-emerald-50/40 p-5 shadow-card sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          Conflict analysis
        </p>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          No material conflicts detected across the available sources.
        </p>
        <p className="mt-1 text-xs text-emerald-700/80">
          Direct contradiction, framing difference, timeline mismatch, missing context, and
          insufficient-evidence checks all came back clear.
        </p>
      </article>
    );
  }
  return (
    <article className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-400">
            Conflict analysis
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink sm:text-xl">
            {summary.total} {summary.total === 1 ? 'conflict' : 'conflicts'} surfaced
          </h3>
        </div>
        {summary.worst_severity > 0 && (
          <p className="text-xs text-ink-500">
            Worst severity{' '}
            <span className="font-semibold text-ink-700 tabular-nums">{summary.worst_severity}/100</span>
          </p>
        )}
      </header>
      <ul className="mt-4 space-y-2.5">
        {conflicts.map((c, i) => (
          <li
            key={i}
            className={`rounded-xl border px-3 py-2.5 ${conflictToneClass(c.severity_band)}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-ink-700">{c.label}</p>
              <p className="text-[11px] uppercase tracking-wider text-ink-500">
                Severity {c.severity_score}/100 · {c.severity_band}
              </p>
            </div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-700">{c.summary}</p>
            {c.sources.length > 0 && (
              <p className="mt-1.5 text-[11px] text-ink-500">
                {c.sources
                  .filter((s) => s.url)
                  .map((s) => s.domain || new URL(s.url).hostname)
                  .join(' vs ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ─── Bias signal (kept separate from confidence) ──────────────────────── */

function BiasCard({ bias }: { bias: CorpusBiasReport }) {
  if (bias.pieces === 0) return null;
  const showSignals = bias.has_signal || bias.avg_intensity > 0;
  return (
    <article className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-400">
            Bias signal
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink sm:text-xl">
            {bias.band === 'neutral'
              ? 'Language reads as broadly observational'
              : bias.band === 'low'
                ? 'Mild bias markers detected'
                : bias.band === 'moderate'
                  ? 'Moderate bias markers detected'
                  : 'Strong bias markers detected'}
            <span className="ml-2 text-sm font-normal text-ink-500">
              {bias.avg_intensity}/100 across {bias.pieces} text{bias.pieces === 1 ? '' : 's'}
            </span>
          </h3>
        </div>
        <span className="rounded-full border border-ink-100 bg-canvas-50 px-2.5 py-1 text-[11px] font-medium text-ink-600">
          Signal · not a verdict
        </span>
      </header>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">{bias.summary}</p>
      {showSignals && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          <BiasRow label="Loaded vocabulary" score={bias.per_signal.loaded_language} />
          <BiasRow label="One-sided framing" score={bias.per_signal.one_sided_framing} />
          <BiasRow label="Selective omission cues" score={bias.per_signal.selective_omission} />
          <BiasRow label="Emotional tone" score={bias.per_signal.emotional_tone} />
        </ul>
      )}
      <p className="mt-3 text-[11px] italic text-ink-500">{bias.disclaimer}</p>
    </article>
  );
}

function BiasRow({ label, score }: { label: string; score: number }) {
  return (
    <li className="rounded-xl border border-ink-100 bg-canvas-50 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] text-ink-700">{label}</p>
        <p className="text-[12.5px] font-semibold tabular-nums text-ink-700">{score}/100</p>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full ${scoreBarClass(score, 'amber')}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </li>
  );
}

/* ─── Ranked sources ───────────────────────────────────────────────────── */

function RankedSourcesCard({ sources }: { sources: RankedSource[] }) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;
  const visible = expanded ? sources : sources.slice(0, 5);
  return (
    <article className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-400">
            Ranked sources
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink sm:text-xl">
            {sources.length} source{sources.length === 1 ? '' : 's'} compared
          </h3>
        </div>
        <p className="text-[11px] text-ink-500">
          Ranked by credibility · directness · recency · independence.
        </p>
      </header>
      <ol className="mt-4 space-y-3">
        {visible.map((s) => (
          <RankedSourceRow key={s.url} source={s} />
        ))}
      </ol>
      {sources.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-[12.5px] font-semibold text-amber-700 hover:text-amber-900"
        >
          {expanded ? 'Show fewer sources' : `Show all ${sources.length} sources`}
        </button>
      )}
    </article>
  );
}

function RankedSourceRow({ source }: { source: RankedSource }) {
  const reasons = source.reasons.slice(0, 3);
  return (
    <li className="rounded-xl border border-ink-100 bg-canvas-50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <span>#{source.rank}</span>
            <span className="rounded-full bg-paper px-2 py-0.5 text-ink-600">
              {roleChip(source.role)}
            </span>
            {source.is_credible && (
              <span className="text-emerald-600">✓ Rated</span>
            )}
            {source.is_syndicated && (
              <span className="text-amber-700">↻ Likely circular</span>
            )}
          </p>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-sm font-medium text-ink-700 hover:text-amber-700"
          >
            {prettyOutletName(source.domain)}
          </a>
          {source.title && (
            <p className="mt-0.5 truncate text-[12.5px] text-ink-500">{source.title}</p>
          )}
        </div>
        <p className="text-sm font-semibold tabular-nums text-ink-700">{source.score}/100</p>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-4">
        <ScorePill label="Cred." score={source.components.credibility} />
        <ScorePill label="Direct." score={source.components.directness} />
        <ScorePill label="Recent" score={source.components.recency} />
        <ScorePill label="Indep." score={source.components.independence} />
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-ink-600">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true" className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${reasonDot(r.effect)}`} />
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ScorePill({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-ink-100 bg-paper px-2 py-1">
      <span className="text-[11px] uppercase tracking-wider text-ink-500">{label}</span>
      <span className="text-[12px] font-semibold tabular-nums text-ink-700">{score}</span>
    </div>
  );
}

/* ─── Evidence cards ───────────────────────────────────────────────────── */

function EvidenceCardsList({
  cards,
  summary,
}: {
  cards: EvidenceCard[];
  summary: EvidenceCardSummary;
}) {
  const [filter, setFilter] = useState<'all' | EvidenceStance>('all');
  if (cards.length === 0) return null;
  const filtered = filter === 'all' ? cards : cards.filter((c) => c.stance === filter);
  return (
    <article className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-400">
            Evidence cards
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink sm:text-xl">
            {cards.length} evidence row{cards.length === 1 ? '' : 's'}
          </h3>
        </div>
        <p className="text-[11px] text-ink-500">
          {summary.supports} supports · {summary.disputes} disputes · {summary.context} context · {summary.neutral} neutral
        </p>
      </header>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterPill>
        {summary.supports > 0 && (
          <FilterPill active={filter === 'supports'} onClick={() => setFilter('supports')}>
            Supports
          </FilterPill>
        )}
        {summary.disputes > 0 && (
          <FilterPill active={filter === 'disputes'} onClick={() => setFilter('disputes')}>
            Disputes
          </FilterPill>
        )}
        {summary.context > 0 && (
          <FilterPill active={filter === 'context'} onClick={() => setFilter('context')}>
            Context
          </FilterPill>
        )}
        {summary.neutral > 0 && (
          <FilterPill active={filter === 'neutral'} onClick={() => setFilter('neutral')}>
            Neutral
          </FilterPill>
        )}
      </div>
      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {filtered.map((card) => (
          <EvidenceCardRow key={card.id} card={card} />
        ))}
      </ul>
    </article>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12px] font-medium transition ${
        active
          ? 'border-ink-300 bg-ink-900 text-paper'
          : 'border-ink-100 bg-paper text-ink-600 hover:border-ink-200'
      }`}
    >
      {children}
    </button>
  );
}

function EvidenceCardRow({ card }: { card: EvidenceCard }) {
  return (
    <li className="rounded-xl border border-ink-100 bg-canvas-50 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold text-ink-700">{card.publisher}</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${evidenceCardStanceClass(card.stance)}`}>
          {capitalize(card.stance)}
        </span>
      </div>
      <a
        href={card.url}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block text-sm font-medium text-ink-700 hover:text-amber-700"
      >
        {card.source_title}
      </a>
      <p className="mt-1 text-[11px] text-ink-500">
        {card.domain}
        {card.publish_date && (
          <>
            {' · '}
            {formatDate(card.publish_date)}
          </>
        )}
        {card.rank != null && <> · #{card.rank}</>}
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-700">
        <span className="font-semibold text-ink">Claim:</span> {card.extracted_claim}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">
        <span className="font-semibold text-ink-700">Why this stance:</span> {card.explanation}
      </p>
    </li>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function bandFriendly(band: ConfidenceBreakdown['band']): string {
  switch (band) {
    case 'high':
      return 'Well-supported comparison';
    case 'medium':
      return 'Mixed evidence';
    case 'contested':
      return 'Sources disagree';
    case 'low':
      return 'Comparison too thin';
  }
}

function scoreBarClass(score: number, palette: 'default' | 'amber' = 'default'): string {
  if (palette === 'amber') {
    if (score >= 60) return 'bg-amber-500';
    if (score >= 30) return 'bg-amber-400';
    return 'bg-amber-200';
  }
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 45) return 'bg-amber-500';
  return 'bg-ink-300';
}

function conflictToneClass(band: 'low' | 'medium' | 'high'): string {
  switch (band) {
    case 'high':
      return 'border-danger-200 bg-danger-50';
    case 'medium':
      return 'border-amber-200 bg-amber-50/70';
    case 'low':
      return 'border-ink-100 bg-canvas-50';
  }
}

function reasonDot(effect: 'positive' | 'negative' | 'neutral'): string {
  switch (effect) {
    case 'positive':
      return 'bg-emerald-500';
    case 'negative':
      return 'bg-amber-500';
    case 'neutral':
      return 'bg-ink-300';
  }
}

function systemStatusClass(status: 'hit' | 'miss' | 'skipped' | 'unavailable' | 'error'): string {
  switch (status) {
    case 'hit':
      return 'bg-emerald-100 text-emerald-800';
    case 'miss':
      return 'bg-ink-100 text-ink-600';
    case 'skipped':
      return 'bg-sky-100 text-sky-800';
    case 'unavailable':
      return 'bg-amber-100 text-amber-800';
    case 'error':
      return 'bg-danger-100 text-danger-700';
  }
}

function roleChip(role: RankedSource['role']): string {
  switch (role) {
    case 'primary':
      return 'Primary';
    case 'official':
      return 'Official';
    case 'reporting':
      return 'Reporting';
    case 'reference':
      return 'Reference';
    case 'social':
      return 'Social';
    case 'aggregator':
      return 'Aggregator';
    case 'unknown':
      return 'Unrated';
  }
}

function evidenceCardStanceClass(s: EvidenceStance): string {
  switch (s) {
    case 'supports':
      return 'bg-emerald-100 text-emerald-800';
    case 'disputes':
      return 'bg-danger-100 text-danger-700';
    case 'context':
      return 'bg-sky-100 text-sky-800';
    case 'neutral':
      return 'bg-ink-100 text-ink-600';
  }
}

function stanceClass(s: ClaimEvidenceStance): string {
  switch (s) {
    case 'directly_supports':
    case 'partially_supports':
      return 'bg-emerald-100 text-emerald-800';
    case 'contradicts':
    case 'weakens':
      return 'bg-danger-100 text-danger-700';
    case 'context_only':
      return 'bg-sky-100 text-sky-800';
    case 'mentions_without_evidence':
      return 'bg-amber-100 text-amber-800';
    case 'cannot_determine':
    case 'unrelated':
      return 'bg-ink-100 text-ink-600';
  }
}

function stanceDisplay(s: ClaimEvidenceStance): string {
  switch (s) {
    case 'directly_supports':
      return 'Direct support';
    case 'partially_supports':
      return 'Partial support';
    case 'contradicts':
      return 'Contradicts';
    case 'weakens':
      return 'Weakens';
    case 'context_only':
      return 'Context';
    case 'mentions_without_evidence':
      return 'Mention only';
    case 'cannot_determine':
      return 'Unclear';
    case 'unrelated':
      return 'Unrelated';
  }
}

function verdictDisplay(v: ClaimVerdict): string {
  return v
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function verdictClass(v: ClaimVerdict): string {
  switch (v) {
    case 'supported':
      return 'border-emerald-200 bg-emerald-100 text-emerald-800';
    case 'partly_supported':
      return 'border-sky-200 bg-sky-100 text-sky-800';
    case 'contradicted':
    case 'unsupported':
      return 'border-danger-200 bg-danger-100 text-danger-700';
    case 'unresolved':
    case 'misleading_framing':
      return 'border-amber-200 bg-amber-100 text-amber-800';
    case 'context_only':
      return 'border-brand-200 bg-brand-500/[0.12] text-brand-800';
    case 'not_enough_evidence':
    case 'not_fact_checkable':
      return 'border-ink-200 bg-ink-100 text-ink-700';
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
