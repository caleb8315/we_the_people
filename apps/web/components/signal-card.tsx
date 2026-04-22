import Link from 'next/link';
import {
  reliabilityPublicLabel,
  reliabilityPublicLabelDisplay,
  statusLabel,
} from '@osint/core';
import type { PhysicalEvidence, ReliabilityPublicLabel } from '@osint/core';
import {
  formatContradictionInline,
  type ContradictionInline,
} from '@/lib/contradictions-display';
import { Badge } from './ui/badge';
import { SeverityMeter } from './ui/severity-meter';

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
  distinct_domains: string[];
  occurred_at?: string | null;
  first_seen_at: string;
  contradictions_count?: number;
  is_disputed?: boolean;
  is_new_since?: boolean;
  /** Signal-level tags; Phase-7 uses `complex_signal` for detection skips. */
  tags?: string[] | null;
  // Phase-3 reliability contract
  reliability_score?: number | null;
  reliability_label?: ReliabilityPublicLabel | null;
  reliability_summary?: string | null;
  // Phase-4 / Phase-5 enrichments (populated by decorateSignals):
  contradictions_inline?: ContradictionInline[];
  physical_evidence?: PhysicalEvidence | null;
  has_usgs_confirmation?: boolean;
  has_satellite_confirmation?: boolean;
  has_deep_dive?: boolean;
}

/**
 * Topics where a geophysical / satellite absence-of-confirmation is
 * informative. We hide the evidence block for topics where neither sensor
 * network would ever be expected (economy, cyber, health, civil, other) —
 * showing "✗ No seismic confirmation" on a markets story is just noise.
 */
const PHYSICAL_EVIDENCE_TOPICS = new Set(['war', 'disaster', 'climate']);

export function SignalCard({ s }: { s: SignalRow }) {
  const confLabel = confidenceLabel(s.confidence);
  const disputed = s.is_disputed ?? (s.contradictions_count ?? 0) > 0;

  // Phase-3: prefer the persisted label; otherwise derive from the score.
  const publicLabel: ReliabilityPublicLabel | null =
    s.reliability_label ??
    (typeof s.reliability_score === 'number'
      ? reliabilityPublicLabel(s.reliability_score)
      : null);

  const inline = (s.contradictions_inline ?? []).slice(0, 3);
  const hasInlineContradictions = inline.length > 0;
  const showEvidenceBlock = PHYSICAL_EVIDENCE_TOPICS.has(s.topic ?? '');
  // Phase 7 — detection was skipped because the signal exceeded the
  // source/claim caps. Show an honest note instead of a silent zero.
  const isComplexSignal = (s.tags ?? []).includes('complex_signal');

  return (
    <Link
      href={`/signal/${s.id}`}
      className="group block rounded-card border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:border-brand-500/50 sm:p-5"
    >
      {/* Phase 4 — top-of-card reliability header: color dot + label + 1-line summary. */}
      {publicLabel && (
        <div className="mb-3 flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${reliabilityDotClass(publicLabel)}`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug text-white">
              {reliabilityPublicLabelDisplay(publicLabel)}
              {typeof s.reliability_score === 'number' && (
                <span className="ml-1.5 font-mono text-[11px] font-normal text-white/55">
                  {s.reliability_score}/100
                </span>
              )}
            </p>
            {s.reliability_summary && (
              <p className="clamp-1 text-xs text-white/65">{s.reliability_summary}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SeverityMeter severity={s.severity} />
        <Badge
          variant={s.verification_status}
          title="Reliability label reflects how well this event is corroborated across credible sources."
        >
          {statusLabel(s.verification_status)}
        </Badge>
        {s.topic && (
          <Badge variant="topic" withIcon={false}>
            {s.topic}
          </Badge>
        )}
        {s.country_code && (
          <Badge variant="country" withIcon={false}>
            {s.country_code}
          </Badge>
        )}
        {disputed && (
          <Badge variant="disputed" title="Sources disagree on a material detail of this signal">
            Sources disagree
          </Badge>
        )}
        {s.is_new_since && (
          <Badge variant="new" title="New since your last visit">
            New
          </Badge>
        )}
        {isComplexSignal && (
          <Badge
            variant="muted"
            withIcon={false}
            title={`Too many sources for inline disagreement detection (limit ${s.source_count} > 20). Open the signal to review evidence directly.`}
          >
            Complex signal
          </Badge>
        )}
        {s.has_deep_dive && (
          <Badge
            variant="verified"
            withIcon={false}
            title="This signal has been independently researched with claim verification and sensor checks."
          >
            Researched
          </Badge>
        )}
      </div>

      <h3 className="mt-2 text-[17px] font-semibold tracking-tight clamp-2 group-hover:text-white sm:text-[16px]">
        {s.title}
      </h3>
      {s.summary && <p className="mt-1 text-[14px] text-white/70 clamp-2 sm:text-sm">{s.summary}</p>}

      {/* Phase 4 — key differences block. Always visible when we have
          disagreements; 1-line bullets each. No click required. Phase 7
          overrides this block with an honest "detection skipped" note when
          the signal was flagged `complex_signal` (too many sources for the
          deterministic detector to reason about). */}
      {isComplexSignal ? (
        <div className="mt-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white/60">
          <p>
            Source-disagreement detection was skipped for this signal — it exceeds the inline limit
            of {20} sources. Open the signal page to review evidence directly.
          </p>
        </div>
      ) : (
        hasInlineContradictions && (
          <div className="mt-3 rounded-md border border-danger-500/30 bg-danger-500/[0.06] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-danger-300">
              ⚠ Key differences detected
            </p>
            <ul className="mt-1.5 space-y-0.5 text-[13px] text-white/85">
              {inline.map((c, i) => (
                <li key={i} className="clamp-1">
                  <span aria-hidden="true" className="text-white/40">•</span>{' '}
                  {formatContradictionInline(c)}
                </li>
              ))}
            </ul>
            {(s.contradictions_count ?? 0) > inline.length && (
              <p className="mt-1 text-[11px] text-white/50">
                +{(s.contradictions_count ?? 0) - inline.length} more on the signal page
              </p>
            )}
          </div>
        )
      )}

      {/* Phase 5 — structured physical evidence block. Only rendered for
          topics where geophysical confirmation is meaningful (war / disaster
          / climate). Never phrases absence as a factual denial — when no
          sensor data supports the report we say "No physical evidence
          detected", never "did not happen". Always shows the limitations
          list so readers can calibrate coverage gaps themselves. */}
      {showEvidenceBlock &&
        (s.physical_evidence ? (
          <PhysicalEvidenceBlock pe={s.physical_evidence} />
        ) : (
          <LegacyEvidenceBlock
            hasUsgs={!!s.has_usgs_confirmation}
            hasSatellite={!!s.has_satellite_confirmation}
          />
        ))}

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-white/55 sm:gap-x-3 sm:text-[12px]">
        <span>
          Sources <strong className="text-white/80">{s.source_count}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Credible <strong className="text-white/80">{s.credible_source_count}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Confidence <strong className="text-white/80">{confLabel}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <span>{relativeTime(s.occurred_at ?? s.first_seen_at)}</span>
      </div>
    </Link>
  );
}

function reliabilityDotClass(label: ReliabilityPublicLabel): string {
  switch (label) {
    case 'LIKELY_ACCURATE':
      return 'bg-brand-500';
    case 'UNCLEAR':
      return 'bg-warn-500';
    case 'LIKELY_UNRELIABLE':
      return 'bg-danger-500';
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
      ? 'text-brand-300'
      : pe.status === 'partial'
        ? 'text-warn-400'
        : 'text-white/55';
  return (
    <div className="mt-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
          Physical evidence
        </p>
        <p className="text-[11px] font-mono text-white/55">
          <span className={statusTone}>{statusLabelText}</span>
          <span className="text-white/40"> · confidence {pe.confidence}/100</span>
        </p>
      </div>
      <ul className="mt-1.5 space-y-0.5 text-[13px]">
        {pe.sources.length > 0 ? (
          pe.sources.map((src, i) => (
            <li key={i} className="text-white/85">
              <span aria-hidden="true" className="mr-1.5 font-mono text-brand-300">
                ✓
              </span>
              {src}
            </li>
          ))
        ) : (
          <li className="text-white/60">
            <span aria-hidden="true" className="mr-1.5 font-mono text-white/40">
              ·
            </span>
            No physical evidence detected from available sensor networks.
          </li>
        )}
      </ul>
      {pe.limitations.length > 0 && (
        <p className="mt-2 clamp-2 text-[11px] text-white/50">
          <span className="text-white/40">Limitations:</span> {pe.limitations.join(' · ')}
        </p>
      )}
    </div>
  );
}

/**
 * Fallback for signals ingested before Phase 5 added `physical_evidence` to
 * `raw_data`. Uses the Phase-4 boolean flags and preserves the wording rule
 * (absence → "No X detected", never "did not happen").
 */
function LegacyEvidenceBlock({
  hasUsgs,
  hasSatellite,
}: {
  hasUsgs: boolean;
  hasSatellite: boolean;
}) {
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
        Physical evidence
      </p>
      <ul className="mt-1 space-y-0.5 text-[13px]">
        <li className={hasUsgs ? 'text-white/85' : 'text-white/55'}>
          <span
            aria-hidden="true"
            className={`mr-1.5 font-mono ${hasUsgs ? 'text-brand-300' : 'text-white/35'}`}
          >
            {hasUsgs ? '✓' : '·'}
          </span>
          {hasUsgs ? 'USGS seismic confirmation' : 'No seismic confirmation detected (USGS)'}
        </li>
        <li className={hasSatellite ? 'text-white/85' : 'text-white/55'}>
          <span
            aria-hidden="true"
            className={`mr-1.5 font-mono ${hasSatellite ? 'text-brand-300' : 'text-white/35'}`}
          >
            {hasSatellite ? '✓' : '·'}
          </span>
          {hasSatellite
            ? 'Satellite confirmation (NASA EONET)'
            : 'No satellite confirmation detected'}
        </li>
      </ul>
    </div>
  );
}

function confidenceLabel(n: number): string {
  if (n >= 75) return 'high';
  if (n >= 45) return 'medium';
  return 'low';
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
