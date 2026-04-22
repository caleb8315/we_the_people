'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Disclosure } from '@/components/ui/disclosure';

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
}

interface ResearchFinding {
  claim_id: string;
  query: string;
  summary: string;
}

interface DeepDiveData {
  claims: Array<{ id: string; statement: string; category: string; importance: string }>;
  research: ResearchFinding[];
  sensor_data: SensorReading[];
  synthesis: { verdicts: ClaimVerdict[] };
  summary: string;
  overall_verdict: string;
  auto_generated: boolean;
  completed_at: string;
  raw_data: { research_duration_ms?: number };
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

export function DeepDiveReport({ signalId }: { signalId: string }) {
  const [data, setData] = useState<DeepDiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/deep-dive/${signalId}`)
      .then(res => {
        if (res.status === 404) { setNotFound(true); setLoading(false); return null; }
        return res.json();
      })
      .then(d => { if (d) { setData(d); setLoading(false); } })
      .catch(() => setLoading(false));
  }, [signalId]);

  if (loading) return null;
  if (notFound || !data) return null;

  const verdicts = data.synthesis?.verdicts ?? [];
  const overallColor = VERDICT_COLORS[data.overall_verdict] ?? VERDICT_COLORS.unverified;
  const overallLabel = VERDICT_LABELS[data.overall_verdict] ?? 'Under Review';
  const duration = data.raw_data?.research_duration_ms
    ? `${(data.raw_data.research_duration_ms / 1000).toFixed(1)}s`
    : null;

  return (
    <Disclosure
      title={
        <span className="flex items-center gap-2">
          Deep Dive Research
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${overallColor}`}>
            {overallLabel}
          </span>
          {data.auto_generated && (
            <span className="text-[10px] text-white/40">auto-generated</span>
          )}
        </span>
      }
      defaultOpen={true}
    >
      <div className="space-y-4">
        {data.summary && (
          <p className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
            {data.summary}
          </p>
        )}

        {/* Sensor Data — shown first since it's the hardest evidence */}
        {data.sensor_data && data.sensor_data.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-white/50">Physical Sensor Data</h4>
            {data.sensor_data.map((sensor, i) => (
              <div
                key={i}
                className={`rounded-md border px-3 py-2 text-sm ${
                  sensor.confirms_event
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/10 bg-white/[0.03] text-white/70'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white/50">{sensor.source}</span>
                  {sensor.confirms_event && (
                    <Badge variant="verified" withIcon={false}>sensor confirmed</Badge>
                  )}
                </div>
                <p className="mt-1">{sensor.summary}</p>
              </div>
            ))}
          </div>
        )}

        {/* Claim-by-claim verdicts */}
        {verdicts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-white/50">Claim Verification</h4>
            {verdicts.map((v, i) => {
              const color = VERDICT_COLORS[v.verdict] ?? VERDICT_COLORS.unverified;
              const label = VERDICT_LABELS[v.verdict] ?? 'Unknown';
              return (
                <div key={i} className={`rounded-md border px-3 py-3 ${color.replace(/text-\S+/, 'text-white/80')}`} style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white/90">&ldquo;{v.statement}&rdquo;</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`}>
                      {label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-white/65">{v.explanation}</p>
                  {v.sensor_confirmation && (
                    <p className="mt-1 text-xs text-emerald-400/80">Sensor: {v.sensor_confirmation}</p>
                  )}
                  {v.supporting_sources.length > 0 && (
                    <p className="mt-1 text-[11px] text-white/45">
                      Supporting: {v.supporting_sources.join(', ')}
                    </p>
                  )}
                  {v.contradicting_sources.length > 0 && (
                    <p className="mt-1 text-[11px] text-red-400/60">
                      Contradicting: {v.contradicting_sources.join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Research trail — transparency */}
        {data.research && data.research.length > 0 && (
          <Disclosure title="Research Trail (what we searched)" defaultOpen={false}>
            <div className="space-y-2 text-xs text-white/60">
              {data.research.map((r, i) => (
                <div key={i} className="rounded border border-white/5 bg-white/[0.02] p-2">
                  <p className="font-medium text-white/70">Query: {r.query}</p>
                  <p className="mt-1 whitespace-pre-line">{r.summary.slice(0, 500)}</p>
                </div>
              ))}
            </div>
          </Disclosure>
        )}

        <p className="text-[10px] text-white/35">
          {data.auto_generated ? 'Automatically researched' : 'Researched on demand'}
          {data.completed_at && ` · ${new Date(data.completed_at).toLocaleString()}`}
          {duration && ` · ${duration}`}
        </p>
      </div>
    </Disclosure>
  );
}
