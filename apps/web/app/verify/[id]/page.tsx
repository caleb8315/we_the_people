import { notFound } from 'next/navigation';
import { getAdminSupabase } from '@/lib/supabase-server';
import { DeepDiveReport } from '@/components/deep-dive-report';

export const revalidate = 30;

type PageProps = { params: { id: string } };

export default async function VerifyResultPage({ params }: PageProps) {
  const sb = getAdminSupabase();

  const { data: dive } = await sb
    .from('deep_dives')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (!dive) notFound();

  const isPending = dive.status === 'pending' || dive.status === 'running';
  const isFailed = dive.status === 'failed';
  const isComplete = dive.status === 'complete';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Verification Report</h1>
        {dive.source_url && (
          <p className="mt-1 text-sm text-white/50">
            Source:{' '}
            <a href={dive.source_url} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">
              {dive.source_url.length > 80 ? dive.source_url.slice(0, 80) + '...' : dive.source_url}
            </a>
          </p>
        )}
      </header>

      {isPending && (
        <div className="rounded-card border border-brand-500/20 bg-brand-500/5 px-5 py-4">
          <p className="text-sm font-medium text-brand-400">Research in progress</p>
          <p className="mt-1 text-sm text-white/70">
            This article is queued for verification. Results will appear here once the
            next research cycle completes. This page will update automatically.
          </p>
          <p className="mt-2 text-xs text-white/40">
            Research cycles run 3 times daily. You can bookmark this page and check back.
          </p>
        </div>
      )}

      {isFailed && (
        <div className="rounded-card border border-amber-500/20 bg-amber-500/5 px-5 py-4">
          <p className="text-sm font-medium text-amber-400">Research could not be completed</p>
          <p className="mt-1 text-sm text-white/70">
            The verification process encountered an issue. This may be due to temporary
            service limits or the article being inaccessible. The system will retry
            during the next research cycle.
          </p>
        </div>
      )}

      {isComplete && dive.signal_id && (
        <DeepDiveReport signalId={dive.signal_id} showRequestButton={false} />
      )}

      {isComplete && !dive.signal_id && dive.summary && (
        <div className="space-y-4">
          <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white/90">Result</span>
              {dive.overall_verdict && (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  dive.overall_verdict === 'corroborated' ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400' :
                  dive.overall_verdict === 'disputed' ? 'border-red-500/30 bg-red-500/20 text-red-400' :
                  dive.overall_verdict === 'mixed' ? 'border-amber-500/30 bg-amber-500/20 text-amber-400' :
                  'border-white/20 bg-white/10 text-white/60'
                }`}>
                  {dive.overall_verdict === 'corroborated' ? 'Corroborated' :
                   dive.overall_verdict === 'disputed' ? 'Disputed' :
                   dive.overall_verdict === 'mixed' ? 'Mixed Evidence' : 'Unverified'}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-white/75">{dive.summary}</p>
          </div>

          {dive.sensor_data && Array.isArray(dive.sensor_data) && dive.sensor_data.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-white/50">Sensor Data</h3>
              {dive.sensor_data.map((s: any, i: number) => (
                <div key={i} className={`rounded-md border px-3 py-2 text-sm ${
                  s.confirms_event ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' :
                  s.confirms_event === null ? 'border-amber-500/20 bg-amber-500/5 text-white/60' :
                  'border-white/10 bg-white/[0.03] text-white/70'
                }`}>
                  <span className="text-xs text-white/50">{s.source}</span>
                  <p className="mt-1">{s.summary}</p>
                </div>
              ))}
            </div>
          )}

          {dive.synthesis?.verdicts && Array.isArray(dive.synthesis.verdicts) && dive.synthesis.verdicts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-white/50">Claims</h3>
              {dive.synthesis.verdicts.map((v: any, i: number) => (
                <div key={i} className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white/90">&ldquo;{v.statement}&rdquo;</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      v.verdict === 'supported' ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400' :
                      v.verdict === 'disputed' ? 'border-red-500/30 bg-red-500/20 text-red-400' :
                      v.verdict === 'partially_supported' ? 'border-amber-500/30 bg-amber-500/20 text-amber-400' :
                      'border-white/20 bg-white/10 text-white/60'
                    }`}>
                      {v.verdict === 'supported' ? 'Supported' :
                       v.verdict === 'disputed' ? 'Disputed' :
                       v.verdict === 'partially_supported' ? 'Partially Supported' : 'Unverified'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-white/65">{v.explanation}</p>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-white/30">
            Crosscheck does not assert truth — it describes what public sources and sensors report.
            {dive.completed_at && ` Completed ${new Date(dive.completed_at).toLocaleString()}.`}
          </p>
        </div>
      )}
    </div>
  );
}
