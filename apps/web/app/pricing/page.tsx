import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';

export const metadata = {
  title: 'Pricing · Crosscheck',
  description:
    'Crosscheck is free forever to read. An optional Supporter tier and one-time donations help cover running costs — they never gate reading, briefings, conflict detection, or evidence panels.',
};

export default function PricingPage() {
  const { sponsorUrl, donateUrl } = siteConfig;
  const hasSupportLinks = Boolean(sponsorUrl || donateUrl);

  return (
    <article className="prose-osint max-w-3xl space-y-8 text-ink-600">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-2 text-ink-600">
          The civic core of Crosscheck — the feed, briefings, conflict detection, and evidence
          panels — is <strong>free forever</strong>. It is not, and will not be, behind a paywall.
        </p>
      </header>

      <section className="not-prose grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-ink-100 bg-white p-6">
          <h2 className="text-lg font-semibold text-ink-800">Reader</h2>
          <p className="mt-1 text-2xl font-semibold text-ink-900">
            $0<span className="text-sm font-normal text-ink-400"> / forever</span>
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-600">
            <li>Full event feed with source citations</li>
            <li>Reliability labels, confidence bands, and conflict breakdowns</li>
            <li>Physical-evidence records with coverage limitations</li>
            <li>Daily and weekly briefings</li>
            <li>Topic filters, source mutes, and priority alerts</li>
            <li>Account data export and deletion</li>
          </ul>
          <Link
            href="/login"
            className="mt-6 inline-flex rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-700"
          >
            Create free account
          </Link>
        </div>

        <div className="rounded-2xl border border-ink-200 bg-canvas p-6">
          <h2 className="text-lg font-semibold text-ink-800">Supporter</h2>
          <p className="mt-1 text-2xl font-semibold text-ink-900">
            $5<span className="text-sm font-normal text-ink-400"> / month, optional</span>
          </p>
          <p className="mt-2 text-sm text-ink-500">
            For readers who want to keep the project independent and ad-free. Support is a
            contribution, not a gate — everything above stays free whether or not you chip in.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-600">
            <li>Keeps Crosscheck running on privacy-respecting infrastructure</li>
            <li>Higher personal AI-analyst and “develop this story” quotas</li>
            <li>A supporter badge and early access to new sources</li>
          </ul>
          {hasSupportLinks ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {sponsorUrl && (
                <a
                  href={sponsorUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-700"
                >
                  Sponsor on GitHub
                </a>
              )}
              {donateUrl && (
                <a
                  href={donateUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex rounded-lg border border-ink-300 px-4 py-2 text-sm font-medium text-ink-800 hover:bg-white"
                >
                  Make a one-time donation
                </a>
              )}
            </div>
          ) : (
            <p className="mt-6 text-sm text-ink-400">
              Support links are being set up. In the meantime, the best way to help is to use the
              product and send feedback to{' '}
              <a className="underline hover:text-ink-700" href={`mailto:${siteConfig.supportEmail}`}>
                {siteConfig.supportEmail}
              </a>
              .
            </p>
          )}
        </div>
      </section>

      <section>
        <h2>What we will never do</h2>
        <ul>
          <li>Paywall reading, the feed, briefings, conflict detection, or evidence panels.</li>
          <li>Run display ads or sell user data.</li>
          <li>Add third-party trackers or advertising pixels.</li>
        </ul>
        <p>
          Crosscheck is built to be sustainable on free-tier infrastructure and funded by optional
          support and grants, so the reading experience can stay open. See our{' '}
          <Link href="/trust">methodology</Link> and <Link href="/about">mission</Link> for how and
          why the project is run this way.
        </p>
      </section>
    </article>
  );
}
