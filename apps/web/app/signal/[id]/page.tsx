import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminSupabase } from '@/lib/supabase-server';

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

  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Tag>{signal.verification_status}</Tag>
          {signal.topic && <Tag>{signal.topic}</Tag>}
          {signal.country_code && <Tag>{signal.country_code}</Tag>}
          <span className="ml-auto text-white/50">
            sev {signal.severity} · conf {confLabel}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{signal.title}</h1>
        {signal.summary && <p className="text-white/75">{signal.summary}</p>}
        <div className="text-xs text-white/50">
          First seen {new Date(signal.first_seen_at).toLocaleString()} ·{' '}
          {signal.source_count} source{signal.source_count === 1 ? '' : 's'} ·{' '}
          {signal.credible_source_count} credible
        </div>
      </header>

      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">Why it&rsquo;s shown</h2>
        <ul className="mt-3 space-y-2 text-sm text-white/75">
          <li>
            This signal groups {signal.source_count} reports across{' '}
            {(signal.distinct_domains ?? []).length} distinct domains.
          </li>
          <li>
            Verification status: <strong>{signal.verification_status}</strong>.{' '}
            {signal.verification_status === 'verified' && 'Two or more credible independent sources corroborate this event.'}
            {signal.verification_status === 'developing' && 'Reported by multiple sources; fewer than two credible independent corroborations so far.'}
            {signal.verification_status === 'unverified' && 'Appears in one or more sources but not yet corroborated across credible outlets.'}
          </li>
          <li>
            Confidence label: <strong>{confLabel}</strong>. Severity is an analyst heuristic (0–100) based on
            keyword weight, not a prediction of outcome.
          </li>
        </ul>
      </section>

      {contradictions && contradictions.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300">
            Inconsistency signals
          </h2>
          <p className="mt-1 text-xs text-white/60">
            Claim and observed data appear to disagree. We do not accuse — we surface the mismatch and the sources.
          </p>
          <ul className="mt-3 space-y-3 text-sm">
            {contradictions.map((c: any) => (
              <li key={c.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p><span className="text-white/60">Claim:</span> {c.claim}</p>
                <p><span className="text-white/60">Observation:</span> {c.observation}</p>
                {c.explanation && <p className="mt-1 text-white/70">{c.explanation}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">Evidence</h2>
        {(!evidence || evidence.length === 0) ? (
          <p className="mt-3 text-sm text-white/60">No evidence rows yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {evidence.map((e: any) => (
              <li key={e.id} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${e.is_credible ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/60'}`}>
                  {e.is_credible ? 'credible' : 'source'}
                </span>
                <div className="flex-1">
                  <a href={e.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {e.title ?? e.url}
                  </a>
                  <div className="text-xs text-white/50">
                    {e.domain}{e.published_at ? ` · ${new Date(e.published_at).toLocaleString()}` : ''}
                  </div>
                  {e.excerpt && <p className="mt-1 text-white/70">{e.excerpt}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 uppercase tracking-wide text-white/70">
      {children}
    </span>
  );
}
