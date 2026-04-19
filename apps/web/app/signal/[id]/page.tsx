import { notFound } from 'next/navigation';
import { getAdminSupabase } from '@/lib/supabase-server';
import { Badge } from '@/components/ui/badge';
import { SeverityMeter } from '@/components/ui/severity-meter';
import { Disclosure } from '@/components/ui/disclosure';

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

  return (
    <article className="space-y-6">
      <header className="rounded-card border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={signal.verification_status}>{signal.verification_status}</Badge>
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
          {contradictionsCount > 0 && <Badge variant="disputed">Disputed ({contradictionsCount})</Badge>}
        </div>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{signal.title}</h1>
        {signal.summary && <p className="mt-2 max-w-3xl text-white/80">{signal.summary}</p>}

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
          <li>
            Verification status: <strong>{signal.verification_status}</strong>.{' '}
            {signal.verification_status === 'verified' &&
              'Two or more credible independent sources corroborate this event.'}
            {signal.verification_status === 'developing' &&
              'Reported by multiple sources; fewer than two credible independent corroborations so far.'}
            {signal.verification_status === 'unverified' &&
              'Appears in one or more sources but not yet corroborated across credible outlets.'}
          </li>
          <li>
            Confidence label: <strong>{confLabel}</strong>. Severity is an analyst heuristic (0-100), not a prediction
            of outcome.
          </li>
        </ul>
      </Disclosure>

      <Disclosure
        title={`Inconsistency signals (${contradictionsCount})`}
        defaultOpen={contradictionsCount > 0}
        tone={contradictionsCount > 0 ? 'danger' : 'neutral'}
        badge={contradictionsCount > 0 ? <Badge variant="disputed">Disputed</Badge> : undefined}
      >
        {contradictionsCount === 0 ? (
          <p className="text-sm text-white/55">No contradictions currently flagged for this signal.</p>
        ) : (
          <>
            <p className="text-xs text-white/60">
              Claim and observed data appear to disagree. We do not accuse — we surface the mismatch and the sources.
            </p>
            <ul className="mt-3 space-y-3 text-sm">
              {(contradictions ?? []).map((c: any) => (
                <li key={c.id} className="rounded-md border border-white/10 bg-white/5 p-3">
                  <p>
                    <span className="text-white/55">Claim:</span> {c.claim}
                  </p>
                  <p>
                    <span className="text-white/55">Observation:</span> {c.observation}
                  </p>
                  {c.explanation && <p className="mt-1 text-white/70">{c.explanation}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </Disclosure>

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
                  {e.is_credible ? 'credible' : 'source'}
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
