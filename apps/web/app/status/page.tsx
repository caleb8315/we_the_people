import { siteConfig } from '@/lib/site-config';
import { getPublicOperationsSnapshot } from '@/lib/public-ops';

export const metadata = {
  title: 'Status · Crosscheck',
  description: 'Current public operational status for Crosscheck.',
};

export const dynamic = 'force-dynamic';

export default async function StatusPage() {
  const snapshot = await getPublicOperationsSnapshot();
  const checks = [
    {
      name: 'Scheduled ingestion',
      status: deriveStatus(runByJob(snapshot, 'ingest')),
      detail: `Hourly ingestion keeps the feed current. Last successful ingest: ${formatTimestamp(runByJob(snapshot, 'ingest').lastSuccessAt)}.`,
    },
    {
      name: 'Briefings',
      status: deriveStatus(runByJob(snapshot, 'brief')),
      detail: `Daily and weekly briefings depend on successful worker runs. Last successful briefing run: ${formatTimestamp(runByJob(snapshot, 'brief').lastSuccessAt)}.`,
    },
    {
      name: 'Alerts',
      status: deriveStatus(runByJob(snapshot, 'alert')),
      detail: `Alert delivery depends on recent alert worker runs. Last successful alert run: ${formatTimestamp(runByJob(snapshot, 'alert').lastSuccessAt)}.`,
    },
    {
      name: 'Story enrichment',
      status: deriveStatus(runByJob(snapshot, 'develop')),
      detail: `Background corroboration deepens developing signals over time. Last successful enrich run: ${formatTimestamp(runByJob(snapshot, 'develop').lastSuccessAt)}.`,
    },
  ];

  return (
    <article className="max-w-4xl space-y-6 text-ink-600">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">Status</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Current service status</h1>
        <p className="text-sm text-ink-500">
          This public view summarizes recent job health from the same operational data the internal ops
          dashboard reads, without exposing sensitive logs or user information.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        {checks.map((check) => (
          <div key={check.name} className="rounded-card border border-ink-100 bg-paper p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">{check.name}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(check.status)}`}>
                {labelForStatus(check.status)}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-500">{check.detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Signals monitored"
          value={snapshot.totals.signals.toLocaleString()}
          hint="public, non-expired signal rows"
        />
        <Metric
          label="Recent job success"
          value={`${snapshot.jobSummary.successRate30d}%`}
          hint="last 30 days across scheduled jobs"
        />
        <Metric
          label="Degraded sources"
          value={(snapshot.sourceHealth.degraded + snapshot.sourceHealth.failed).toLocaleString()}
          hint="latest source-health snapshot"
        />
      </section>

      <section className="rounded-card border border-ink-100 bg-canvas-50 p-4">
        <h2 className="text-base font-semibold text-ink">Report a problem</h2>
        <p className="mt-2 text-sm text-ink-500">
          If you hit a broken page, stale data, or a briefing issue, include the URL, time, and any
          screenshots when you email support so we can reproduce it quickly.
        </p>
        <p className="mt-2 text-sm">
          Contact{' '}
          <a href={`mailto:${siteConfig.supportEmail}`} className="underline">
            {siteConfig.supportEmail}
          </a>
          .
        </p>
      </section>
    </article>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-card border border-ink-100 bg-paper p-4 shadow-card">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
    </div>
  );
}

function deriveStatus(job: { lastSuccessAt: string | null; lastStatus: string | null }): 'healthy' | 'degraded' | 'unknown' {
  if (!job.lastSuccessAt && !job.lastStatus) return 'unknown';
  if (job.lastStatus === 'failed') return 'degraded';
  return 'healthy';
}

function runByJob(
  snapshot: Awaited<ReturnType<typeof getPublicOperationsSnapshot>>,
  job: 'ingest' | 'brief' | 'alert' | 'develop',
): { lastSuccessAt: string | null; lastStatus: string | null } {
  return snapshot.jobs[job];
}

function labelForStatus(status: 'healthy' | 'degraded' | 'unknown'): string {
  if (status === 'healthy') return 'Operational';
  if (status === 'degraded') return 'Degraded';
  return 'Unknown';
}

function statusClass(status: 'healthy' | 'degraded' | 'unknown'): string {
  if (status === 'healthy') return 'bg-brand-50 text-brand-700';
  if (status === 'degraded') return 'bg-amber-50 text-amber-700';
  return 'bg-ink-100 text-ink-500';
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not available yet';
  return new Date(value).toLocaleString();
}
