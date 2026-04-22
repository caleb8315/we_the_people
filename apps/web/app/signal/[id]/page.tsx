import { notFound } from 'next/navigation';
import {
  physicalEvidencePhrase,
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
  // Phase 3 contract: prefer the persisted label/summary; fall back to a
  // live computation so older rows (ingested before migration 016) still
  // render a sane label using the Phase-2 score.
  const publicLabel: ReliabilityPublicLabel | null =
    (signal.reliability_label as ReliabilityPublicLabel | null) ??
    (typeof signal.reliability_score === 'number'
      ? reliabilityPublicLabel(signal.reliability_score)
      : null);
  const reliabilitySummary: string | null = signal.reliability_summary ?? null;
  // Phase 5 — pull the structured physical-evidence record out of raw_data
  // (the ingest pipeline persists it there; no schema migration required).
  const physicalEvidence = extractPhysicalEvidence(signal.raw_data ?? null);
  // Phase 7 — detection-skip flags drive the "complex signal" UX states.
  const isComplexSignal = Array.isArray(signal.tags)
    ? (signal.tags as string[]).includes('complex_signal')
    : false;
  const detectionMeta = extractDetectionMeta(signal.raw_data ?? null);
  const complexSignalReason = detectionMeta?.reason ?? null;
  const complexSourceCount = detectionMeta?.source_count ?? null;
  const complexClaimCount = detectionMeta?.claim_count ?? null;
  const wireInfo = extractWireInfo(signal.raw_data ?? null);

  return (
    <article className="space-y-6">
      <header className="rounded-card border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={signal.verification_status}
            title="Reliability label reflects how well this event is corroborated across credible sources."
          >
            {statusLabel(signal.verification_status)}
          </Badge>
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
          {contradictionsCount > 0 && (
            <Badge variant="disputed">Sources disagree ({contradictionsCount})</Badge>
          )}
          {publicLabel && (
            <Badge
              variant={
                publicLabel === 'LIKELY_ACCURATE'
                  ? 'verified'
                  : publicLabel === 'UNCLEAR'
                    ? 'developing'
                    : 'disputed'
              }
              withIcon={false}
              title="Reliability describes how well the reporting is corroborated across public sources — it does not describe what happened."
            >
              {reliabilityPublicLabelDisplay(publicLabel)}
              {typeof signal.reliability_score === 'number' ? ` · ${signal.reliability_score}/100` : ''}
            </Badge>
          )}
        </div>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{signal.title}</h1>
        {signal.summary && <p className="mt-2 max-w-3xl text-white/80">{signal.summary}</p>}
        {reliabilitySummary && (
          <p className="mt-3 max-w-3xl rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/75">
            <span className="text-white/50">Reliability summary:</span> {reliabilitySummary}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/60">
          <SeverityMeter severity={signal.severity} label="severity" size="md" />
          <span aria-hidden="true">·</span>
          <span>
            Confidence <strong className="text-white/85">{confLabel}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {signal.source_count} source{signal.source_count === 1 ? '' : 's'}, {signal.credible_source_count} credible
          </span>
          <span aria-hidden="true">·</span>
          <span>First seen {new Date(signal.first_seen_at).toLocaleString()}</span>
        </div>
      </header>

      <Disclosure title="Why it’s shown" defaultOpen={true}>
        <ul className="space-y-2 text-sm text-white/75">
          <li>
            This signal groups {signal.source_count} reports across {(signal.distinct_domains ?? []).length} distinct
            domains.
          </li>
          {wireInfo && wireInfo.total > wireInfo.independent && (
            <li>
              Wire provenance: {wireInfo.independent} independent source{wireInfo.independent === 1 ? '' : 's'} out
              of {wireInfo.total} total.
              {Object.keys(wireInfo.wire_groups).length > 0 && (
                <span> Syndicated content detected from {Object.keys(wireInfo.wire_groups).join(', ')}.</span>
              )}
            </li>
          )}
          <li>
            Reliability label: <strong>{statusLabel(signal.verification_status)}</strong>.{' '}
            {statusDescription(signal.verification_status)}
          </li>
          <li>
            Confidence: <strong>{confLabel}</strong>. Severity is an analyst heuristic (0–100). Both are
            descriptive of the reporting, not predictive of outcomes.
          </li>
        </ul>
      </Disclosure>

      {signal.reliability_score != null && (
        <Disclosure
          title={`Reliability score: ${signal.reliability_score} / 100${
            publicLabel ? ` · ${reliabilityPublicLabelDisplay(publicLabel)}` : ''
          }`}
          defaultOpen={true}
        >
          <p className="text-xs text-white/60">
            A composite of four signals about how this event is being reported. It describes how well the story is
            corroborated across public sources and open sensor data — it does not describe what happened, and it
            does not replace the reliability label or confidence above.
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
              hint="USGS / NASA-EONET sensor matches plus 4+ credible outlets."
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

      <DeepDiveReport signalId={signal.id} />

      <Disclosure
        title={`Source disagreement (${contradictionsCount})`}
        defaultOpen={contradictionsCount > 0 || isComplexSignal}
        tone={contradictionsCount > 0 ? 'danger' : isComplexSignal ? 'warn' : 'neutral'}
        badge={
          contradictionsCount > 0
            ? <Badge variant="disputed">Sources disagree</Badge>
            : isComplexSignal
              ? <Badge variant="muted" withIcon={false}>Detection skipped</Badge>
              : undefined
        }
      >
        {isComplexSignal ? (
          <div className="text-sm text-white/70 space-y-2">
            <p>
              Source-disagreement detection was skipped for this signal because it exceeded the
              per-signal safety limits ({complexSignalReason === 'too_many_sources'
                ? `${complexSourceCount ?? 'many'} sources, cap is 20`
                : `${complexClaimCount ?? 'many'} claims, cap is 50`}).
              The evidence list below is complete and un-truncated — please review it directly
              instead of relying on the deterministic detector output.
            </p>
            <p className="text-xs text-white/55">
              This is a cost- and performance-safety rail, not an editorial decision. We never
              summarise large disputes with an LLM in-line and never output "no disagreements" for
              a signal we simply couldn&apos;t reason about.
            </p>
          </div>
        ) : contradictionsCount === 0 ? (
          <p className="text-sm text-white/55">No source disagreements are currently flagged for this signal.</p>
        ) : (
          <>
            <p className="text-xs text-white/60">
              A public claim and observed reporting appear to disagree on a material detail. We surface the mismatch
              and the underlying sources — we do not accuse anyone and we make no finding of fact.
            </p>
            <ul className="mt-3 space-y-3 text-sm">
              {(contradictions ?? []).map((c: any) => {
                const meta = (c.metadata ?? {}) as Record<string, any>;
                const a = meta.a as { source?: string } | undefined;
                const b = meta.b as { source?: string } | undefined;
                const assertion = meta.assertion as { source?: string } | undefined;
                const observation = meta.observation as { source?: string } | undefined;
                const pair =
                  a?.source && b?.source
                    ? `${a.source} vs ${b.source}`
                    : assertion?.source && observation?.source
                      ? `${assertion.source} vs ${observation.source}`
                      : null;
                return (
                  <li key={c.id} className="rounded-md border border-white/10 bg-white/5 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="disputed" withIcon={false}>
                        {formatContradictionType(c.type)}
                      </Badge>
                      <Badge
                        variant={
                          c.severity === 'high'
                            ? 'disputed'
                            : c.severity === 'medium'
                              ? 'developing'
                              : 'neutral'
                        }
                        withIcon={false}
                      >
                        severity: {c.severity ?? 'medium'}
                      </Badge>
                      {pair && (
                        <span className="text-[11px] text-white/55 font-mono">{pair}</span>
                      )}
                    </div>
                    <p className="mt-2 text-white/85">{c.summary ?? c.claim}</p>
                    <p className="mt-1 text-[12px] text-white/55">
                      Inline: {formatContradictionInline(c)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Disclosure>

      {physicalEvidence && (
        <Disclosure
          title={`Physical evidence · ${physicalEvidence.status.replace('_', ' ')}`}
          defaultOpen={true}
        >
          <p className="text-xs text-white/65">{physicalEvidencePhrase(physicalEvidence)}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
                Sources ({physicalEvidence.sources.length})
              </p>
              <ul className="mt-1.5 space-y-0.5 text-sm">
                {physicalEvidence.sources.length === 0 ? (
                  <li className="text-white/55">
                    No sensor networks contributed confirming data.
                  </li>
                ) : (
                  physicalEvidence.sources.map((src, i) => (
                    <li key={i} className="text-white/85">
                      <span aria-hidden="true" className="mr-1.5 font-mono text-brand-300">
                        ✓
                      </span>
                      {src}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
                Limitations ({physicalEvidence.limitations.length})
              </p>
              <ul className="mt-1.5 space-y-1 text-sm text-white/75">
                {physicalEvidence.limitations.map((lim, i) => (
                  <li key={i}>
                    <span aria-hidden="true" className="mr-1.5 text-white/40">
                      ·
                    </span>
                    {lim}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-white/45">
            Confidence: {physicalEvidence.confidence}/100. &quot;No evidence detected&quot;
            describes sensor coverage for this window — it does not describe what happened.
          </p>
        </Disclosure>
      )}

      <Disclosure title={`Evidence (${evidenceCount})`} defaultOpen={evidenceCount > 0}>
        {evidenceCount === 0 ? (
          <p className="text-sm text-white/55">No evidence rows yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(evidence ?? []).map((e: any) => (
              <li
                key={e.id}
                className="flex items-start gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3"
              >
                <Badge variant={e.is_credible ? 'verified' : 'neutral'} withIcon={false}>
                  {e.is_credible ? 'credible outlet' : 'source'}
                </Badge>
                <div className="min-w-0 flex-1">
                  <a href={e.url} target="_blank" rel="noreferrer" className="font-medium text-white hover:underline">
                    {e.title ?? e.url}
                  </a>
                  <div className="text-xs text-white/50">
                    {e.domain}
                    {e.published_at ? ` · ${new Date(e.published_at).toLocaleString()}` : ''}
                  </div>
                  {e.excerpt && <p className="mt-1 text-white/70">{e.excerpt}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
    </article>
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

function extractWireInfo(
  raw: Record<string, unknown> | null,
): { total: number; independent: number; wire_groups: Record<string, number> } | null {
  if (!raw) return null;
  const log = raw.decision_log;
  if (!Array.isArray(log)) return null;
  for (const entry of log) {
    if (typeof entry === 'string' && entry.startsWith('wire_provenance:')) {
      const match = entry.match(/(\d+) total domains, (\d+) independent/);
      if (match) {
        const wireMatch = entry.match(/wire: ({[^}]+})/);
        let wireGroups: Record<string, number> = {};
        if (wireMatch) {
          try { wireGroups = JSON.parse(wireMatch[1]!.replace(/'/g, '"')); } catch {}
        }
        return {
          total: parseInt(match[1]!, 10),
          independent: parseInt(match[2]!, 10),
          wire_groups: wireGroups,
        };
      }
    }
  }
  return null;
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
    ? 'bg-danger-500/70'
    : shown != null && shown >= 65
      ? 'bg-brand-500/80'
      : shown != null && shown >= 35
        ? 'bg-warn-500/70'
        : 'bg-white/25';
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-xs uppercase tracking-wider text-white/60">{label}</dt>
        <dd className="font-mono text-sm text-white/85">{shown ?? '—'}/100</dd>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full ${tone}`}
          style={{ width: shown != null ? `${Math.max(0, Math.min(100, shown))}%` : '0%' }}
        />
      </div>
      <p className="mt-2 text-[11px] text-white/55">{hint}</p>
    </div>
  );
}
