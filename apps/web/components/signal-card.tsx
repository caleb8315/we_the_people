import Link from 'next/link';
import { statusLabel } from '@osint/core';
import type {
  AnalyzedConflict,
  ConfidenceBand,
  ConfidenceBreakdown,
  ConfidenceReport,
  CorpusBiasReport,
  PhysicalEvidence,
  RankedSource,
  RankedSourceSummary,
  TrustExplanation,
} from '@osint/core';
import {
  formatContradictionInline,
  type ContradictionInline,
} from '@/lib/contradictions-display';
import { Badge } from './ui/badge';
import { RelativeTime } from './relative-time';

/**
 * Light-theme Signal card (April 2026 redesign).
 *
 * Layout is inspired by the "Travel Package" card in the reference
 * mockup: a colorful topic tile on the left, content + band-aware
 * confidence header on the right, and a small amber action affordance
 * at the card's bottom-right.
 *
 * Still consumes the unified `ConfidenceReport` contract — no parallel
 * band logic lives here.
 */

export interface SignalRow {
  id: string;
  title: string;
  summary: string | null;
  source_id?: string | null;
  topic: string | null;
  country_code: string | null;
  severity: number;
  confidence: number;
  verification_status: 'verified' | 'developing' | 'unverified' | 'quarantined' | 'blocked';
  source_count: number;
  credible_source_count: number;
  // Accept `null` so we can assign `DecoratedSignal` (which carries the raw
  // DB column shape) directly without casting through `any`. The card treats
  // null the same as an empty list.
  distinct_domains: string[] | null;
  occurred_at?: string | null;
  first_seen_at: string;
  contradictions_count?: number;
  is_disputed?: boolean;
  is_new_since?: boolean;
  tags?: string[] | null;
  confidence_report?: ConfidenceReport;
  trust_explanation?: TrustExplanation;
  physical_evidence?: PhysicalEvidence | null;
  contradictions_inline?: ContradictionInline[];
  // April 2026 evidence-comparison upgrade. The decorate path always
  // populates these (persisted-or-computed), but we keep them optional
  // on the row type so unit tests / older callers can omit them.
  ranked_sources?: RankedSource[];
  analyzed_conflicts?: AnalyzedConflict[];
  bias_report?: CorpusBiasReport;
  confidence_breakdown?: ConfidenceBreakdown;
}

const PHYSICAL_EVIDENCE_TOPICS = new Set(['war', 'disaster', 'climate']);

const TOPIC_TILE: Record<string, string> = {
  war: 'tile-war',
  economy: 'tile-economy',
  climate: 'tile-climate',
  health: 'tile-health',
  civil: 'tile-civil',
  cyber: 'tile-cyber',
  disaster: 'tile-disaster',
  tech: 'tile-tech',
  finance: 'tile-finance',
};

const TOPIC_GLYPH: Record<string, string> = {
  war: '⚔',
  economy: '₵',
  climate: '❅',
  health: '✚',
  civil: '☷',
  cyber: '⌬',
  disaster: '⚠',
  tech: '◈',
  finance: '◆',
};

export function SignalCard({ s }: { s: SignalRow }) {
  const report = s.confidence_report;
  const band: ConfidenceBand = report?.band ?? 'low';
  const isComplexSignal = (s.tags ?? []).includes('complex_signal');
  const inline = (s.contradictions_inline ?? []).slice(0, 3);
  const disputed = s.is_disputed ?? (s.contradictions_count ?? 0) > 0;
  const showEvidenceBlock = PHYSICAL_EVIDENCE_TOPICS.has(s.topic ?? '');

  const tileClass = TOPIC_TILE[s.topic ?? ''] ?? 'tile-default';
  const glyph = TOPIC_GLYPH[s.topic ?? ''] ?? '◎';

  return (
    <Link
      href={`/signal/${s.id}`}
      className="group block overflow-hidden rounded-card border border-ink-100 bg-paper shadow-card transition hover:shadow-card-hover focus-visible:border-amber-400"
    >
      <div className="flex flex-col sm:flex-row">
        {/* Topic tile — acts as the "image" in the reference's Travel Package
            cards. On mobile it's a full-width band; on desktop it's a
            fixed-width panel on the left. */}
        <div
          className={`relative flex h-28 items-end justify-between px-4 py-3 sm:h-auto sm:w-44 sm:min-w-[11rem] sm:flex-col sm:items-start ${tileClass}`}
          aria-hidden="true"
        >
          <span className="text-4xl font-semibold text-white/85 mix-blend-overlay">{glyph}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-700 backdrop-blur">
            {s.topic ?? 'signal'}
            {s.country_code && <span className="text-ink-500">· {s.country_code}</span>}
          </span>
        </div>

        <div className="min-w-0 flex-1 p-4 sm:p-5">
          {/* Event title first — the thing the reader is here to see. */}
          <h3 className="text-[18px] font-semibold leading-snug tracking-tight text-ink clamp-2 group-hover:text-ink-700 sm:text-[20px]">
            {s.title}
          </h3>
          {s.summary && (
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-500 clamp-2 sm:text-[15px]">
              {cleanCardSummary(s.summary)}
            </p>
          )}

          {/* Verdict callout — the single line the reader is here for.
              Band-tinted background so it reads as the card's headline
              judgement rather than a subtle footer. The summary is
              sourced from the deterministic trust explainer when
              available so feed copy is identical to the signal page,
              and run through the same forbidden-phrase guard. */}
          {report && (
            <div
              className={`mt-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${bandCalloutClass(band)}`}
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${bandDotClass(band)}`}
              />
              <p className="min-w-0 text-[14px] leading-snug clamp-3 sm:text-[15px]">
                <span className="font-semibold text-ink">{report.label_display}.</span>{' '}
                <span className="text-ink-700">
                  {s.trust_explanation?.summary ?? report.summary}
                </span>
              </p>
            </div>
          )}

          {/* Compact "Watch for" line — appears only when the explainer
              has a hint to give (contested cause, single-source story,
              syndicated wire repetition). Keeps low-confidence cards
              honest without adding chrome to every signal. */}
          {s.trust_explanation?.watch_for && (
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-amber-800 sm:text-[13px]">
              <span
                aria-hidden="true"
                className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
              />
              <span className="clamp-2">
                <span className="font-semibold uppercase tracking-wider text-amber-700 text-[10px]">
                  Watch for
                </span>{' '}
                {s.trust_explanation.watch_for}
              </span>
            </p>
          )}

          {isComplexSignal && (
            <div className="mt-3 rounded-xl border border-ink-100 bg-canvas-100 px-3 py-2 text-[12px] text-ink-500">
              Source-disagreement detection was skipped (over inline limit). Open the signal page
              to review evidence directly.
            </div>
          )}

          {!isComplexSignal && inline.length > 0 && (
            <div className="mt-3 rounded-xl border border-danger-200 bg-danger-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-danger-700">
                Key differences detected
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-ink-700">
                {inline.map((c, i) => (
                  <li key={i} className="clamp-1">
                    <span aria-hidden="true" className="text-danger-500">
                      •
                    </span>{' '}
                    {formatContradictionInline(c)}
                  </li>
                ))}
              </ul>
              {(s.contradictions_count ?? 0) > inline.length && (
                <p className="mt-1 text-[11px] text-danger-600">
                  +{(s.contradictions_count ?? 0) - inline.length} more on the signal page
                </p>
              )}
            </div>
          )}

          {showEvidenceBlock && s.physical_evidence && (
            <PhysicalEvidenceBlock pe={s.physical_evidence} />
          )}

          {/* April 2026 evidence-comparison strip — at-a-glance source
              mix, top conflict severity, and a bias signal chip. The
              chip is colour-tinted but explicitly labelled "signal" so
              it never reads as a verdict. Hidden when the row is from
              an old un-decorated path (no analyzed_conflicts) so we
              never render an empty strip. */}
          {(s.ranked_sources && s.ranked_sources.length > 0) && (
            <ComparisonStrip
              ranked={s.ranked_sources}
              conflicts={s.analyzed_conflicts ?? []}
              bias={s.bias_report ?? null}
              breakdown={s.confidence_breakdown ?? null}
            />
          )}

          {/* Meta + CTA row */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-400 sm:text-[12px]">
              <Badge
                variant={s.verification_status}
                title="Reliability label reflects how well this event is corroborated across credible sources."
              >
                {statusLabel(s.verification_status)}
              </Badge>
              {disputed && (
                <Badge
                  variant="disputed"
                  title="Sources disagree on a material detail of this signal"
                >
                  Sources disagree
                </Badge>
              )}
              {s.is_new_since && (
                <Badge variant="new" title="New since your last visit">
                  New
                </Badge>
              )}
              <span>
                <strong className="text-ink-700">{s.source_count}</strong> source
                {s.source_count === 1 ? '' : 's'}
              </span>
              <span aria-hidden="true">·</span>
              <RelativeTime iso={s.occurred_at ?? s.first_seen_at} />
              {(s as any).community_feedback?.total > 0 && <FeedbackIndicator fb={(s as any).community_feedback} />}
            </div>
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-[0_6px_16px_-4px_rgba(245,158,11,0.55)] transition group-hover:bg-amber-600"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m13 5 7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function bandDotClass(band: ConfidenceBand): string {
  switch (band) {
    case 'high':
      return 'bg-brand-500';
    case 'medium':
      return 'bg-amber-500';
    case 'contested':
      return 'bg-danger-500';
    case 'low':
      return 'bg-ink-300';
  }
}

function bandCalloutClass(band: ConfidenceBand): string {
  switch (band) {
    case 'high':
      return 'border-brand-200 bg-brand-50/70';
    case 'medium':
      return 'border-amber-200 bg-amber-50/80';
    case 'contested':
      return 'border-danger-200 bg-danger-50';
    case 'low':
      return 'border-ink-100 bg-canvas-50';
  }
}

function PhysicalEvidenceBlock({ pe }: { pe: PhysicalEvidence }) {
  const statusLabelText =
    pe.status === 'confirmed'
      ? 'Confirmed'
      : pe.status === 'partial'
        ? 'Partial'
        : 'None detected';
  const statusTone =
    pe.status === 'confirmed'
      ? 'text-brand-600'
      : pe.status === 'partial'
        ? 'text-amber-600'
        : 'text-ink-400';
  return (
    <div className="mt-3 rounded-xl border border-ink-100 bg-canvas-50 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          Physical evidence
        </p>
        <p className={`text-[11px] font-semibold ${statusTone}`}>{statusLabelText}</p>
      </div>
      <ul className="mt-1.5 space-y-0.5 text-[13px]">
        {pe.sources.length > 0 ? (
          pe.sources.slice(0, 3).map((src, i) => (
            <li key={i} className="text-ink-700">
              <span aria-hidden="true" className="mr-1.5 text-brand-600">
                ✓
              </span>
              {src}
            </li>
          ))
        ) : (
          <li className="text-ink-500">
            <span aria-hidden="true" className="mr-1.5 text-ink-300">
              ·
            </span>
            No physical evidence detected from available sensor networks.
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * At-a-glance comparison strip for the feed card. Three chips:
 *   1. Source mix (primaries / officials / rated outlets)
 *   2. Worst conflict (when any) with numeric severity
 *   3. Bias signal (always with the "signal" qualifier)
 * Plus an optional confidence-breakdown sparkline on the right edge.
 */
function ComparisonStrip({
  ranked,
  conflicts,
  bias,
  breakdown,
}: {
  ranked: RankedSource[];
  conflicts: AnalyzedConflict[];
  bias: CorpusBiasReport | null;
  breakdown: ConfidenceBreakdown | null;
}) {
  const mix = computeMixSummary(ranked);
  const worstConflict = conflicts
    .filter((c) => c.type !== 'insufficient_evidence')
    .sort((a, b) => b.severity_score - a.severity_score)[0] ?? null;
  const showBias = bias && bias.has_signal;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-ink-100 bg-canvas-50 px-2.5 py-2 text-[11px]">
      <span className="font-semibold uppercase tracking-wider text-ink-500">
        Comparison
      </span>
      <span aria-hidden="true" className="text-ink-300">·</span>
      <span className="text-ink-600">{mix}</span>
      {worstConflict && (
        <>
          <span aria-hidden="true" className="text-ink-300">·</span>
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${conflictChipClass(worstConflict.severity_band)}`}
            title={worstConflict.summary}
          >
            {conflictLabel(worstConflict)} {worstConflict.severity_score}/100
          </span>
        </>
      )}
      {showBias && bias && (
        <>
          <span aria-hidden="true" className="text-ink-300">·</span>
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${biasChipClass(bias.band)}`}
            title={bias.summary}
          >
            Bias signal · {bias.band}
          </span>
        </>
      )}
      {breakdown && (
        <span className="ml-auto text-ink-500">
          {breakdown.composite}/100 confidence
        </span>
      )}
    </div>
  );
}

function computeMixSummary(ranked: RankedSource[]): string {
  const primaries = ranked.filter((r) => r.role === 'primary').length;
  const officials = ranked.filter((r) => r.role === 'official').length;
  const rated = ranked.filter(
    (r) => r.is_credible && r.role !== 'primary' && r.role !== 'official',
  ).length;
  const total = ranked.length;
  const parts: string[] = [];
  if (primaries > 0) parts.push(`${primaries} primary`);
  if (officials > 0) parts.push(`${officials} official`);
  if (rated > 0) parts.push(`${rated} rated`);
  if (parts.length === 0) parts.push(`${total} source${total === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function conflictLabel(c: AnalyzedConflict): string {
  switch (c.type) {
    case 'direct_contradiction':
      return 'Contradiction';
    case 'framing_difference':
      return 'Framing';
    case 'timeline_mismatch':
      return 'Timeline';
    case 'missing_context':
      return 'Missing context';
    case 'insufficient_evidence':
      return 'Thin';
  }
}

function conflictChipClass(band: 'low' | 'medium' | 'high'): string {
  switch (band) {
    case 'high':
      return 'bg-danger-100 text-danger-700';
    case 'medium':
      return 'bg-amber-100 text-amber-800';
    case 'low':
      return 'bg-ink-100 text-ink-600';
  }
}

function biasChipClass(band: 'neutral' | 'low' | 'moderate' | 'strong'): string {
  switch (band) {
    case 'strong':
      return 'bg-amber-100 text-amber-800';
    case 'moderate':
      return 'bg-amber-50 text-amber-700';
    case 'low':
      return 'bg-ink-100 text-ink-600';
    case 'neutral':
      return 'bg-emerald-50 text-emerald-700';
  }
}

function FeedbackIndicator({ fb }: { fb: { helpful: number; unclear: number; inaccurate: number; total: number } }) {
  if (fb.total < 1) return null;

  if (fb.inaccurate >= 2 || (fb.inaccurate > 0 && fb.inaccurate >= fb.helpful)) {
    return (
      <>
        <span aria-hidden="true">·</span>
        <span className="text-danger-600" title={`${fb.inaccurate} reader${fb.inaccurate === 1 ? '' : 's'} flagged this as inaccurate`}>
          {fb.inaccurate} flagged inaccurate
        </span>
      </>
    );
  }

  if (fb.helpful >= 2) {
    return (
      <>
        <span aria-hidden="true">·</span>
        <span className="text-brand-600" title={`${fb.helpful} reader${fb.helpful === 1 ? '' : 's'} found this helpful`}>
          {fb.helpful} found helpful
        </span>
      </>
    );
  }

  return null;
}

function cleanCardSummary(raw: string): string {
  let text = raw;
  text = text.replace(
    /^(?:Country:\s*\S+\s*)?(?:Source:\s*[^.]+\.?\s*)?(?:Please refer to the attached file\.?\s*)?(?:Overview\s*)?(?:The following (?:overview|summary|report) (?:has been|was) (?:generated|compiled|prepared)[^.]*\.?\s*)?(?:It provides a synthesized summary[^.]*\.?\s*)?/i,
    '',
  );
  text = text.replace(/^Summary\s+/i, '');
  text = text.replace(/^(?:Key (?:Insights|Findings|Points|Takeaways):\s*)/i, '');
  text = text.replace(/\s{2,}/g, ' ').trim();
  return text || raw;
}
