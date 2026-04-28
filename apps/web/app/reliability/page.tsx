import { StatTile } from '@/components/ui/stat-tile';
import { getPublicOperationsSnapshot } from '@/lib/public-ops';

export const metadata = {
  title: 'Reliability · Crosscheck',
  description: 'Public reliability snapshot for scheduled jobs, coverage freshness, and monitored sources.',
};

export const dynamic = 'force-dynamic';

export default async function ReliabilityPage() {
  const snapshot = await getPublicOperationsSnapshot();

  return (
    <article className="space-y-6 text-ink-600">
      <header className="max-w-3xl space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
          Public reliability
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Operational reliability snapshot</h1>
        <p className="text-sm text-ink-500">
          This page shows a sanitized public view of Crosscheck&apos;s scheduled jobs and source-health
          coverage. It intentionally omits secrets, user data, and internal debugging details.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Recent runs" value={snapshot.jobCards.reduce((sum, job) => sum + job.runCount, 0).toLocaleString()} hint="last 7 days" />
        <StatTile
          label="Successful"
          value={`${snapshot.jobSummary.successRate30d}%`}
          hint="success + partial over the last 30 days"
          tone="accent"
        />
        <StatTile label="Sources monitored" value={snapshot.totals.sources.toLocaleString()} />
        <StatTile
          label="Degraded sources"
          value={(snapshot.sourceHealth.degraded + snapshot.sourceHealth.failed).toLocaleString()}
          tone={snapshot.sourceHealth.degraded + snapshot.sourceHealth.failed > 0 ? 'warn' : 'neutral'}
          hint="latest source-health rows"
        />
      </section>

      <section className="rounded-card border border-ink-100 bg-paper p-5 shadow-card">
        <h2 className="text-lg font-semibold text-ink">Scheduled job health</h2>
        {snapshot.jobCards.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No recent engine run data is available yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {snapshot.jobCards.map((job) => (
              <li key={job.job} className="rounded-card border border-ink-100 bg-canvas-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold capitalize text-ink">{job.job}</h3>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      job.health === 'healthy'
                        ? 'bg-brand-50 text-brand-700'
                        : job.health === 'degraded'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-danger-50 text-danger-700'
                    }`}
                  >
                    {job.health}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-500">
                  Last run {job.lastRunLabel}. Success rate over the last 7 days: {job.successRate}%.
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  Recent volume: {job.recordsOut} records out across {job.runCount} runs.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-ink-100 bg-paper p-5 shadow-card">
        <h2 className="text-lg font-semibold text-ink">Source coverage freshness</h2>
        {snapshot.sourceGroups.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">Source-health snapshots have not been written yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {snapshot.sourceGroups.map((group) => (
              <li key={group.label} className="rounded-card border border-ink-100 bg-canvas-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink">{group.label}</h3>
                  <span className="text-xs text-ink-500">
                    {group.ok}/{group.total} healthy
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-500">
                  Latest run {group.latestRunLabel}. Degraded or failed feeds: {group.degraded}.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
