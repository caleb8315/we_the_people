import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { AccessRequestForm } from '@/components/access-request-form';

export const metadata = {
  title: 'Crosscheck — see where reporting agrees, conflicts, and lacks evidence',
};

const TOPIC_TILES: Array<{ label: string; slug: string; tile: string; kicker: string }> = [
  { label: 'Conflict', slug: 'war', tile: 'tile-war', kicker: 'Global' },
  { label: 'Economy', slug: 'economy', tile: 'tile-economy', kicker: 'Markets' },
  { label: 'Climate', slug: 'climate', tile: 'tile-climate', kicker: 'Sensors' },
  { label: 'Cyber', slug: 'cyber', tile: 'tile-cyber', kicker: 'Incidents' },
  { label: 'Disaster', slug: 'disaster', tile: 'tile-disaster', kicker: 'Realtime' },
  { label: 'Civil', slug: 'civil', tile: 'tile-civil', kicker: 'Society' },
  { label: 'Tech', slug: 'tech', tile: 'tile-tech', kicker: 'Innovation' },
  { label: 'Finance', slug: 'finance', tile: 'tile-finance', kicker: 'Banking' },
];

export default async function LandingPage() {
  let signedIn = false;
  try {
    const sb = getServerSupabase();
    const { data } = await sb.auth.getUser();
    signedIn = !!data.user;
  } catch {
    // Anonymous fallback when env/auth isn't available.
  }

  if (signedIn) redirect('/dashboard');

  return (
    <div className="space-y-10 sm:space-y-14">
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
          Source consistency
        </p>
        <h1 className="mt-3 max-w-3xl text-[40px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[56px]">
          let&apos;s find out <br className="hidden sm:block" />
          <span className="text-ink-500">what the world actually agrees on.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base text-ink-500 sm:text-lg">
          Crosscheck reads public reporting and open sensor networks, clusters them by event, and
          shows three things for each: how sources agree, where they conflict, and which pieces of
          evidence are still missing.
        </p>

        {/* Search-like CTA row matching the reference's rounded input + filter button. */}
        <form action="/feed" className="mt-7 flex max-w-xl items-center gap-3">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-ink-100 bg-paper px-4 py-3 shadow-card">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-ink-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              name="topic"
              type="search"
              placeholder="Search signals, topics, countries"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-400 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            aria-label="Browse feed"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-[0_8px_20px_-6px_rgba(245,158,11,0.55)] hover:bg-amber-600"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m13 5 7 7-7 7" />
            </svg>
          </button>
        </form>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={signedIn ? '/dashboard' : '/login'}
            className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-700"
          >
            {signedIn ? 'Open dashboard' : 'Get your workspace'}
          </Link>
          <Link
            href="/verify"
            className="rounded-full border border-ink-100 bg-paper px-5 py-2.5 text-sm font-medium text-ink hover:border-ink-200"
          >
            Verify a claim
          </Link>
          <Link
            href="/trust"
            className="rounded-full border border-ink-100 bg-paper px-5 py-2.5 text-sm font-medium text-ink-500 hover:text-ink"
          >
            Methodology
          </Link>
        </div>
      </section>

      {!signedIn && (
        <section className="grid gap-5 rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:grid-cols-[1.1fr_0.9fr] sm:p-6">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
              Private beta access
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Request an invite for user testing</h2>
            <p className="max-w-xl text-sm text-ink-500">
              Crosscheck is opening carefully so we can validate source quality, briefing usefulness,
              and onboarding friction with real users. Request access here and operators can review it
              from the built-in ops queue.
            </p>
            <ul className="space-y-2 text-sm text-ink-600">
              <li>Approved testers can sign in with email/password immediately.</li>
              <li>Requests stay private and are reviewed manually during the beta cohorts.</li>
              <li>Need institutional access? Include your newsroom, NGO, or research use case.</li>
            </ul>
          </div>
          <div className="rounded-card border border-ink-100 bg-canvas-50 p-4">
            <AccessRequestForm />
          </div>
        </section>
      )}

      {/* Topic browser — the reference's "Travel Place" row, adapted. */}
      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              Browse by topic
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Pick a topic to jump straight into today&apos;s corroboration map.
            </p>
          </div>
          <Link
            href="/feed"
            className="text-sm font-semibold text-amber-600 hover:text-amber-700"
          >
            See all
          </Link>
        </div>
        <ul className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible lg:grid-cols-6">
          {TOPIC_TILES.map((t) => (
            <li key={t.slug} className="snap-start">
              <Link
                href={`/feed?topic=${t.slug}`}
                className="group flex w-44 flex-col overflow-hidden rounded-card border border-ink-100 bg-paper shadow-card transition hover:shadow-card-hover sm:w-auto"
              >
                <span className={`block h-28 ${t.tile} sm:h-32`} aria-hidden="true" />
                <span className="flex items-center justify-between gap-2 px-4 py-3">
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-ink">{t.label}</span>
                    <span className="text-[11px] uppercase tracking-wider text-ink-400">
                      {t.kicker}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white transition group-hover:bg-amber-600"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="m13 5 7 7-7 7" />
                    </svg>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* What you get — feature trio, now on the light canvas. */}
      <section>
        <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          What Crosscheck gives you
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Feature
            title="Agreement"
            body="Cluster public reports by event and show how many independent credible sources are telling the same story."
          />
          <Feature
            title="Conflicts"
            body="Surface numeric mismatches, cause disagreements, and presence vs. absence discrepancies — with direct citations."
          />
          <Feature
            title="Evidence gaps"
            body="Report when seismic, satellite, or weather-service sensor data supports a claim, and just as clearly when it doesn't."
          />
        </div>
      </section>

    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-ink-100 bg-paper p-5 shadow-card">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-ink-500">{body}</p>
    </div>
  );
}
