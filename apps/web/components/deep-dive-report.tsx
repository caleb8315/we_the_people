'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Disclosure } from '@/components/ui/disclosure';
import { RequestDeepDive } from '@/components/request-deep-dive';

interface ClaimVerdict {
  claim_id: string;
  statement: string;
  verdict: 'supported' | 'disputed' | 'unverified' | 'partially_supported';
  confidence: number;
  supporting_sources: string[];
  contradicting_sources: string[];
  sensor_confirmation: string | null;
  explanation: string;
}

interface SensorReading {
  source: string;
  type: string;
  summary: string;
  confirms_event: boolean | null;
  data?: Record<string, unknown>;
}

interface ResearchFinding {
  claim_id: string;
  query: string;
  summary: string;
}

interface DeepDiveData {
  status: string;
  claims: Array<{ id: string; statement: string; category: string; importance: string }>;
  research: ResearchFinding[];
  sensor_data: SensorReading[];
  synthesis: { verdicts: ClaimVerdict[] };
  summary: string;
  overall_verdict: string;
  auto_generated?: boolean;
  completed_at: string;
  raw_data: { research_duration_ms?: number; error?: string };
}

const VERDICT_COLORS: Record<string, string> = {
  supported: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  partially_supported: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  disputed: 'bg-red-500/20 text-red-400 border-red-500/30',
  unverified: 'bg-white/10 text-white/60 border-white/20',
  corroborated: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  mixed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const VERDICT_LABELS: Record<string, string> = {
  supported: 'Supported',
  partially_supported: 'Partially Supported',
  disputed: 'Disputed',
  unverified: 'Unverified',
  corroborated: 'Corroborated',
  mixed: 'Mixed Evidence',
};

const SENSOR_ICONS: Record<string, string> = {
  seismic: 'Seismic',
  thermal: 'Thermal',
  weather: 'Weather',
  satellite: 'Satellite',
};

export function DeepDiveReport({ signalId, showRequestButton = true }: { signalId: string; showRequestButton?: boolean }) {
  const [data, setData] = useState<DeepDiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/deep-dive/${signalId}`)
      .then(res => {
        if (res.status === 404) { setLoading(false); return null; }
        if (!res.ok) { setError(true); setLoading(false); return null; }
        return res.json();
      })
      .then(d => { if (d) { setData(d); setLoading(false); } })
      .catch(() => { setError(true); setLoading(false); });
  }, [signalId]);

  if (loading) return null;

  // No deep dive exists yet — show the request button
  if (!data && !error) {
    return showRequestButton ? <RequestDeepDive signalId={signalId} /> : null;
  }

  // API error — the deep dive service itself had an issue
  if (error) {
    return (
      <section className="rounded-card border border-white/10 bg-white/[0.03] px-4 py-3">
        <p className="text-sm text-white/60">
          Deep dive research is temporarily unavailable. Cross-source analysis,
          reliability scoring, and source disagreement detection remain fully operational above.
        </p>
      </section>
    );
  }

  if (!data) return showRequestButton ? <RequestDeepDive signalId={signalId} /> : null;

  const verdicts = data.synthesis?.verdicts ?? [];
  const overallColor = VERDICT_COLORS[data.overall_verdict] ?? VERDICT_COLORS.unverified;
  const overallLabel = VERDICT_LABELS[data.overall_verdict] ?? 'Under Review';
  const duration = data.raw_data?.research_duration_ms
    ? `${(data.raw_data.research_duration_ms / 1000).toFixed(1)}s`
    : null;

  const hasAnyClaims = data.claims && data.claims.length > 0;
  const hasAnyResearch = data.research && data.research.some(r =>
    r.summary.length > 50 && !r.summary.includes('could not be completed')
  );
  const hasSensorData = data.sensor_data && data.sensor_data.length > 0;
  const sensorErrors = (data.sensor_data ?? []).filter(s => s.confirms_event === null);
  const sensorConfirmed = (data.sensor_data ?? []).filter(s => s.confirms_event === true);

  return (
    <Disclosure
      title={
        <span className="flex items-center gap-2">
          Deep Dive Research
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${overallColor}`}>
            {overallLabel}
          </span>
          {data.auto_generated && (
            <span className="text-[10px] text-white/40">automatic</span>
          )}
        </span>
      }
      defaultOpen={true}
    >
      <div className="space-y-4">
        {/* Summary — always shown */}
        {data.summary && (
          <p className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
            {data.summary}
          </p>
        )}

        {/* Sensor Data — shown first, hardest evidence. Includes error states. */}
        {hasSensorData && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-white/50">
              Physical Sensor Data
            </h4>
            {data.sensor_data.map((sensor, i) => {
              const isError = sensor.confirms_event === null;
              const isConfirmed = sensor.confirms_event === true;
              const sensorType = SENSOR_ICONS[sensor.type] ?? sensor.type;

              let borderClass: string;
              let bgClass: string;
              if (isError) {
                borderClass = 'border-amber-500/20';
                bgClass = 'bg-amber-500/5';
              } else if (isConfirmed) {
                borderClass = 'border-emerald-500/30';
                bgClass = 'bg-emerald-500/10';
              } else {
                borderClass = 'border-white/10';
                bgClass = 'bg-white/[0.03]';
              }

              return (
                <div key={i} className={`rounded-md border ${borderClass} ${bgClass} px-3 py-2 text-sm`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                      {sensorType}
                    </span>
                    <span className="text-xs text-white/50">{sensor.source}</span>
                    {isConfirmed && (
                      <Badge variant="verified" withIcon={false}>sensor confirmed</Badge>
                    )}
                    {isError && (
                      <span className="text-[10px] text-amber-400/70">limited availability</span>
                    )}
                  </div>
                  <p className={`mt-1 ${isError ? 'text-white/50' : isConfirmed ? 'text-emerald-300' : 'text-white/70'}`}>
                    {sensor.summary}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Claim verdicts — handle empty/partial gracefully */}
        {hasAnyClaims && verdicts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-white/50">
              Claim Verification ({verdicts.filter(v => v.verdict !== 'unverified').length}/{verdicts.length} assessed)
            </h4>
            {verdicts.map((v, i) => {
              const color = VERDICT_COLORS[v.verdict] ?? VERDICT_COLORS.unverified;
              const label = VERDICT_LABELS[v.verdict] ?? 'Under Review';
              return (
                <div
                  key={i}
                  className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white/90">
                      &ldquo;{v.statement}&rdquo;
                    </p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`}>
                      {label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-white/65">{v.explanation}</p>
                  {v.sensor_confirmation && (
                    <p className="mt-1 text-xs text-emerald-400/80">
                      Sensor: {v.sensor_confirmation}
                    </p>
                  )}
                  {v.supporting_sources && v.supporting_sources.length > 0 && (
                    <p className="mt-1 text-[11px] text-white/45">
                      Supporting: {v.supporting_sources.join(', ')}
                    </p>
                  )}
                  {v.contradicting_sources && v.contradicting_sources.length > 0 && (
                    <p className="mt-1 text-[11px] text-red-400/60">
                      Contradicting: {v.contradicting_sources.join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* When claims were extracted but no verdicts (synthesis failed completely) */}
        {hasAnyClaims && verdicts.length === 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-white/50">
              Claims Identified
            </h4>
            <p className="text-xs text-white/50">
              These claims were identified in the reporting but could not be
              independently assessed at this time. You can verify them using the
              source links in the evidence section.
            </p>
            <ul className="space-y-1">
              {data.claims.map((c, i) => (
                <li key={i} className="rounded border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-white/75">
                  &ldquo;{c.statement}&rdquo;
                  <span className="ml-2 text-[10px] text-white/35">{c.category}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Research trail */}
        {data.research && data.research.length > 0 && (
          <Disclosure title="Research Trail (what we searched)" defaultOpen={false}>
            <div className="space-y-2 text-xs text-white/60">
              {data.research.map((r, i) => {
                const isFailed = r.summary.includes('could not be completed') ||
                                 r.summary.includes('unavailable');
                return (
                  <div
                    key={i}
                    className={`rounded border p-2 ${
                      isFailed
                        ? 'border-amber-500/10 bg-amber-500/5'
                        : 'border-white/5 bg-white/[0.02]'
                    }`}
                  >
                    <p className="font-medium text-white/70">Query: {r.query}</p>
                    <p className={`mt-1 whitespace-pre-line ${isFailed ? 'text-amber-400/60' : ''}`}>
                      {r.summary.slice(0, 600)}
                    </p>
                  </div>
                );
              })}
            </div>
          </Disclosure>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-white/35">
          <span>
            {data.auto_generated ? 'Researched automatically' : 'Researched on demand'}
            {data.completed_at && ` · ${new Date(data.completed_at).toLocaleString()}`}
            {duration && ` · ${duration}`}
          </span>
          <span className="text-white/25">
            Crosscheck does not assert truth — it describes what public sources and sensors report.
          </span>
        </div>
      </div>
    </Disclosure>
  );
}
