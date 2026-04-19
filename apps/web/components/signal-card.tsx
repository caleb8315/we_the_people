import Link from 'next/link';

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
  distinct_domains: string[];
  first_seen_at: string;
}

const STATUS_STYLES: Record<SignalRow['verification_status'], string> = {
  verified: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  developing: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  unverified: 'bg-white/5 text-white/60 border-white/10',
  quarantined: 'bg-red-500/10 text-red-300 border-red-500/20',
  blocked: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export function SignalCard({ s }: { s: SignalRow }) {
  const label = confidenceLabel(s.confidence);
  return (
    <Link
      href={`/signal/${s.id}`}
      className="block rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:bg-white/[0.06]"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded border px-2 py-0.5 uppercase tracking-wide ${STATUS_STYLES[s.verification_status]}`}>
          {s.verification_status}
        </span>
        {s.topic && (
          <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 uppercase tracking-wide text-white/70">
            {s.topic}
          </span>
        )}
        {s.country_code && (
          <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">
            {s.country_code}
          </span>
        )}
        <span className="ml-auto text-white/50">
          sev {s.severity} · conf {label}
        </span>
      </div>

      <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
      {s.summary && <p className="mt-1 text-sm text-white/70 line-clamp-3">{s.summary}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/50">
        <span>{s.source_count} source{s.source_count === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>{s.credible_source_count} credible</span>
        <span>·</span>
        <span>{new Date(s.first_seen_at).toLocaleString()}</span>
      </div>
    </Link>
  );
}

function confidenceLabel(n: number): string {
  if (n >= 75) return 'high';
  if (n >= 45) return 'medium';
  return 'low';
}
