export const metadata = {
  title: 'Status · Crosscheck',
  description: 'Current product status and operational expectations for Crosscheck.',
};

const checks = [
  {
    name: 'Web app',
    status: 'Operational',
    detail: 'Public pages, feed, briefings, and settings should load normally.',
  },
  {
    name: 'Scheduled ingestion',
    status: 'Monitored',
    detail: 'Hourly ingest and daily briefing jobs are supervised through the internal ops dashboard.',
  },
  {
    name: 'Email briefings',
    status: 'Beta',
    detail: 'Delivery volume is intentionally capped to protect the free-tier sender budget during testing.',
  },
];

export default function StatusPage() {
  return (
    <article className="max-w-3xl space-y-6 text-ink-600">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">Status</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Current service status</h1>
        <p className="text-sm text-ink-500">
          Crosscheck is in production beta. This page provides the public-facing summary while
          operators review deeper metrics in the internal ops dashboard.
        </p>
      </header>

      <section className="space-y-3">
        {checks.map((check) => (
          <div key={check.name} className="rounded-card border border-ink-100 bg-paper p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">{check.name}</h2>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                {check.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-500">{check.detail}</p>
          </div>
        ))}
      </section>

      <section className="rounded-card border border-ink-100 bg-canvas-50 p-4">
        <h2 className="text-base font-semibold text-ink">Report a problem</h2>
        <p className="mt-2 text-sm text-ink-500">
          If you hit a broken page, stale data, or a briefing issue, include the URL, time, and any
          screenshots when you email support so we can reproduce it quickly.
        </p>
        <p className="mt-2 text-sm">
          Contact <a href="mailto:hello@crosscheck.news" className="underline">hello@crosscheck.news</a>.
        </p>
      </section>
    </article>
  );
}
