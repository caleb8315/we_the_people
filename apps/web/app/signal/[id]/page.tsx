import { notFound } from 'next/navigation';
import {
  reliabilityPublicLabel,
  reliabilityPublicLabelDisplay,
  statusDescription,
  statusLabel,
} from '@osint/core';
import type { PhysicalEvidence, ReliabilityPublicLabel } from '@osint/core';
import { getAdminSupabase } from '@/lib/supabase-server';
import { Badge } from '@/components/ui/badge';
import { SeverityMeter } from '@/components/ui/severity-meter';
import { DeepDiveReport } from '@/components/deep-dive-report';
import { Disclosure } from '@/components/ui/disclosure';
import {
  formatContradictionInline,
  formatContradictionType,
} from '@/lib/contradictions-display';

export const revalidate = 30;

type PageProps = { params: { id: string } };

export default async function SignalPage({ params }: PageProps) {
  const sb = getAdminSupabase();

  const [{ data: signal }, { data: evidence }, { data: contradictions }] = await Promise.all([
    sb.from('signals_public').select('*').eq('id', params.id).maybeSingle(),
    sb.from('evidence').select('*').eq('signal_id', params.id).order('published_at', { ascending: false }),
    sb.from('contradictions').select('*').eq('signal_id', params.id),
  ]);

  if (!signal) notFound();

  const confLabel = signal.confidence >= 75 ? 'high' : signal.confidence >= 45 ? 'medium' : 'low';
  const contradictionsCount = (contradictions ?? []).length;
  const evidenceCount = (evidence ?? []).length;
  const publicLabel: ReliabilityPublicLabel | null =
    (signal.reliability_label as ReliabilityPublicLabel | null) ??
    (typeof signal.reliability_score === 'number'
      ? reliabilityPublicLabel(signal.reliability_score)
      : null);
  const reliabilitySummary: string | null = signal.reliability_summary ?? null;
  const physicalEvidence = extractPhysicalEvidence(signal.raw_data ?? null);

  return (
    <article className="mx-auto max-w-3xl space-y-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={signal.verification_status}>
            {statusLabel(signal.verification_status)}
          </Badge>
          {signal.topic && <Badge variant="topic" withIcon={false}>{signal.topic}</Badge>}
          {signal.country_code && <Badge variant="country" withIcon={false}>{signal.country_code}</Badge>}
          {contradictionsCount > 0 && (
            <Badge variant="disputed">Sources disagree ({contradictionsCount})</Badge>
          )}
        </div>

        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{signal.title}</h1>
        {signal.summary && <p className="text-white/75">{signal.summary}</p>}

        <div className="flex flex-wrap items-center gap-3 text-xs text-white/50">
          <SeverityMeter severity={signal.severity} label="severity" size="md" />
          <span>{signal.source_count} source{signal.source_count === 1 ? '' : 's'}, {signal.credible_source_count} credible</span>
          <span>Confidence: {confLabel}</span>
          {publicLabel && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              publicLabel === 'LIKELY_ACCURATE' ? 'bg-emerald-500/20 text-emerald-400' :
              publicLabel === 'UNCLEAR' ? 'bg-amber-500/20 text-amber-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {reliabilityPublicLabelDisplay(publicLabel)}
            </span>
          )}
        </div>

        {reliabilitySummary && (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
            {reliabilitySummary}
          </p>
        )}
      </header>

      {/* ── Deep Dive (FIRST — most valuable content) ──────────────── */}
      <DeepDiveReport signalId={signal.id} />

      {/* ── Source disagreements ────────────────────────────────────── */}
      {contradictionsCount > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-white/50">
            Where sources disagree ({contradictionsCount})
          </h2>
          <div className="space-y-2">
            {(contradictions ?? []).map((c: any) => (
              <div
                key={c.id}
                className="rounded-lg border border-red-500/15 bg-red-500/[0.04] px-3 py-2.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                    {formatContradictionType(c.type)}
                  </span>
                  {c.severity && (
                    <span className="text-[10px] text-white/35">{c.severity}</span>
                  )}
                </div>
                <p className="mt-1 text-white/75">{c.summary}</p>
                {c.metadata?.a?.source && c.metadata?.b?.source && (
                  <p className="mt-1 text-[11px] text-white/40">
                    {c.metadata.a.source} vs {c.metadata.b.source}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Evidence list ──────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-white/50">
          Sources ({evidenceCount})
        </h2>
        {evidenceCount === 0 ? (
          <p className="text-sm text-white/40">No evidence rows yet.</p>
        ) : (
          <div className="space-y-1.5">
            {(evidence ?? []).map((e: any) => (
              <a
                key={e.id}
                href={e.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/15 hover:bg-white/[0.04]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white/90">
                    {e.title ?? e.domain}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-white/40">
                    <span>{e.domain}</span>
                    {e.is_credible && (
                      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-400">
                        credible
                      </span>
                    )}
                    {e.published_at && (
                      <span>{new Date(e.published_at).toLocaleDateString()}</span>
                    )}
                  </div>
                  {e.excerpt && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-white/50">{e.excerpt}</p>
                  )}
                </div>
                <span className="shrink-0 text-white/20">→</span>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* ── Reliability details (collapsed by default — for power users) */}
      {signal.reliability_score != null && (
        <Disclosure
          title={`How we scored this (${signal.reliability_score}/100)`}
          defaultOpen={false}
        >
          <p className="text-xs text-white/50">
            A composite of four dimensions describing how well this event is corroborated
            across public sources and sensor data.
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
              hint="Distinct domains vs. total sources."
            />
            <ScoreRow
              label="Evidence strength"
              value={signal.evidence_strength_score}
              hint="Sensor matches + credible outlet count."
            />
            <ScoreRow
              label="Narrative divergence"
              value={signal.narrative_divergence_score}
              hint="Source disagreements detected (lower is better)."
              danger
            />
          </dl>
          <p className="mt-3 text-[11px] text-white/35">
            {statusDescription(signal.verification_status)}
          </p>
        </Disclosure>
      )}

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <p className="text-center text-[10px] text-white/25">
        First seen {new Date(signal.first_seen_at).toLocaleString()}
        {' · '}
        Crosscheck describes the shape of public reporting — it does not assert truth.
      </p>
    </article>
  );
}

function extractPhysicalEvidence(raw: Record<string, unknown> | null): PhysicalEvidence | null {
  if (!raw) return null;
  const pe = raw.physical_evidence;
  if (!pe || typeof pe !== 'object') return null;
  const candidate = pe as Record<string, unknown>;
  const status = candidate.status;
  if (status !== 'confirmed' && status !== 'partial' && status !== 'none_detected') return null;
  return {
    status,
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : 0,
    sources: Array.isArray(candidate.sources) ? candidate.sources.filter(s => typeof s === 'string') as string[] : [],
    limitations: Array.isArray(candidate.limitations) ? candidate.limitations.filter(s => typeof s === 'string') as string[] : [],
  };
}

function ScoreRow({ label, value, hint, danger = false }: {
  label: string; value: number | null | undefined; hint: string; danger?: boolean;
}) {
  const shown = typeof value === 'number' ? value : null;
  const tone = danger
    ? 'bg-red-500/60'
    : shown != null && shown >= 65 ? 'bg-emerald-500/70'
    : shown != null && shown >= 35 ? 'bg-amber-500/60'
    : 'bg-white/25';
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-baseline justify-between">
        <dt className="text-xs text-white/50">{label}</dt>
        <dd className="font-mono text-sm text-white/80">{shown ?? '—'}</dd>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, shown ?? 0))}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-white/35">{hint}</p>
    </div>
  );
}
