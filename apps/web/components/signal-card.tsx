import Link from 'next/link';
import {
  reliabilityPublicLabel,
  reliabilityPublicLabelDisplay,
  statusLabel,
} from '@osint/core';
import type { ReliabilityPublicLabel } from '@osint/core';

export interface SignalRow {
  id: string;
  title: string;
  summary: string | null;
  topic: string | null;
  country_code: string | null;
  severity: number;
  confidence: number;
  verification_status: 'verified' | 'developing' | 'unverified' | 'quarantined' | 'blocked';
  source_count: number;
  credible_source_count: number;
  occurred_at?: string | null;
  first_seen_at: string;
  contradictions_count?: number;
  is_disputed?: boolean;
  reliability_score?: number | null;
  reliability_label?: ReliabilityPublicLabel | null;
  reliability_summary?: string | null;
  has_deep_dive?: boolean;
}

export function SignalCard({ s }: { s: SignalRow }) {
  const publicLabel: ReliabilityPublicLabel | null =
    s.reliability_label ??
    (typeof s.reliability_score === 'number'
      ? reliabilityPublicLabel(s.reliability_score)
      : null);

  const disputed = s.is_disputed ?? (s.contradictions_count ?? 0) > 0;
  const isCorroborated = s.verification_status === 'verified';
  const hasResearch = s.has_deep_dive;

  const borderClass = hasResearch
    ? 'border-brand-500/20 hover:border-brand-500/40 shadow-glow'
    : isCorroborated
      ? 'border-emerald-500/15 hover:border-emerald-500/30'
      : 'border-zinc-800 hover:border-zinc-700';

  return (
    <Link
      href={`/signal/${s.id}`}
      className={`group flex h-full flex-col rounded-2xl border bg-zinc-900/50 p-4 backdrop-blur-sm transition-all duration-200 hover:bg-zinc-900/80 hover:-translate-y-0.5 ${borderClass}`}
    >
      {/* Top row: topic + meta */}
      <div className="flex items-center gap-2 text-[11px]">
        {s.topic && s.topic !== 'other' && (
          <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
            {s.topic}
          </span>
        )}
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          isCorroborated ? 'bg-emerald-500/15 text-emerald-400' :
          s.verification_status === 'developing' ? 'bg-amber-500/15 text-amber-400' :
          'bg-white/[0.06] text-white/40'
        }`}>
          {statusLabel(s.verification_status)}
        </span>
        {hasResearch && (
          <span className="rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-400">
            Researched
          </span>
        )}
        {disputed && (
          <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
            Disputed
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="mt-2 flex-1 text-sm font-medium leading-snug text-white/90 group-hover:text-white">
        {s.title}
      </h3>

      {/* Summary (2 lines max) */}
      {s.summary && (
        <p className="mt-1.5 line-clamp-2 text-xs text-white/45">
          {s.summary}
        </p>
      )}

      {/* Bottom row: sources + time */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-white/35">
        <span>
          {s.source_count} source{s.source_count === 1 ? '' : 's'}
          {s.credible_source_count > 0 && (
            <span> · {s.credible_source_count} credible</span>
          )}
        </span>
        <span>{relativeTime(s.occurred_at ?? s.first_seen_at)}</span>
      </div>
    </Link>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
