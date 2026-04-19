import Link from 'next/link';
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
  first_seen_at: string;
  contradictions_count?: number;
  is_disputed?: boolean;
  is_new_since?: boolean;
}

export function SignalCard({ s }: { s: SignalRow }) {
  const confLabel = confidenceLabel(s.confidence);
  const disputed = s.is_disputed ?? (s.contradictions_count ?? 0) > 0;

  return (
    <Link
      href={`/signal/${s.id}`}
      className="group block rounded-card border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:border-brand-500/50 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityMeter severity={s.severity} />
        <Badge variant={s.verification_status}>{s.verification_status}</Badge>
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
          <Badge variant="disputed" title="Contradictions flagged on this signal">
            Disputed
          </Badge>
        )}
        {s.is_new_since && (
          <Badge variant="new" title="New since your last visit">
            New
          </Badge>
        )}
      </div>

      <h3 className="mt-2 text-[17px] font-semibold tracking-tight clamp-2 group-hover:text-white sm:text-[16px]">
        {s.title}
      </h3>
      {s.summary && <p className="mt-1 text-[14px] text-white/70 clamp-2 sm:text-sm">{s.summary}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-white/55 sm:mt-3 sm:gap-x-3 sm:text-[12px]">
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
        <span>{relativeTime(s.first_seen_at)}</span>
      </div>
    </Link>
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
