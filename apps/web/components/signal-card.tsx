import Link from 'next/link';
import { statusLabel } from '@osint/core';
import type { ConfidenceBand, ConfidenceReport, PhysicalEvidence } from '@osint/core';
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
  physical_evidence?: PhysicalEvidence | null;
  contradictions_inline?: ContradictionInline[];
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
              judgement rather than a subtle footer. The bullets that
              used to sit beneath it moved to the signal-detail page —
              on a feed card they added noise without adding new info. */}
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
                <span className="text-ink-700">{report.summary}</span>
              </p>
            </div>
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
