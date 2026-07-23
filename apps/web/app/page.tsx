import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata = {
  title: 'Crosscheck — built for the people who want the truth',
};

const TOPIC_TILES: Array<{ label: string; slug: string; tile: string; kicker: string }> = [
  { label: 'Conflict', slug: 'war', tile: 'tile-war', kicker: 'Global' },
  { label: 'Economy', slug: 'economy', tile: 'tile-economy', kicker: 'Markets' },
  { label: 'Climate', slug: 'climate', tile: 'tile-climate', kicker: 'Sensors' },
  { label: 'Cyber', slug: 'cyber', tile: 'tile-cyber', kicker: 'Incidents' },
  { label: 'Disaster', slug: 'disaster', tile: 'tile-disaster', kicker: 'Realtime' },
  { label: 'Civil', slug: 'civil', tile: 'tile-civil', kicker: 'Society' },
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
    <div className="space-y-12 sm:space-y-16">
      {/* Full-bleed hero — one composition: brand, headline, line, CTAs, visual plane */}
      <section className="relative left-1/2 w-screen max-w-none -translate-x-1/2 overflow-hidden">
        <div className="hero-mesh relative min-h-[78vh] px-4 py-10 text-white sm:min-h-[72vh] sm:px-6 sm:py-14">
          <div
            className="pointer-events-none absolute inset-0 opacity-40 animate-drift"
            aria-hidden="true"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />
          <div className="relative mx-auto flex min-h-[66vh] max-w-6xl flex-col justify-end pb-4 sm:min-h-[58vh] sm:justify-center sm:pb-0">
            <p className="animate-rise-in font-display text-4xl font-semibold tracking-tight text-white sm:text-6xl md:text-7xl">
              Crosscheck
            </p>
            <h1 className="animate-rise-in-delay mt-4 max-w-2xl font-display text-2xl font-medium leading-tight tracking-tight text-white/95 sm:text-4xl">
              Know what&apos;s real before you share it.
            </h1>
            <p className="animate-rise-in-late mt-4 max-w-xl text-base text-white/75 sm:text-lg">
              Paste a claim. Earn XP. See what looks trustworthy, what clashes, and what&apos;s still thin —
              built for regular people, not gatekeepers.
            </p>
            <div className="animate-rise-in-late mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/verify"
                className="rounded-2xl bg-flare px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_-10px_rgba(228,87,46,0.7)] transition hover:bg-flare-600"
              >
                Verify a claim · +25 XP
              </Link>
              <Link
                href="/feed"
                className="rounded-2xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
              >
                Open the live feed
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How the game works */}
      <section>
        <div className="max-w-2xl">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-signal">
            How it works
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Three moves. Clear answers.
          </h2>
          <p className="mt-2 text-sm text-ink-500 sm:text-base">
            No black boxes. Every call links back to real sources.
          </p>
        </div>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          <Step
            n="01"
            title="Drop a claim"
            body="Paste a headline, URL, or rumor from your group chat. We fan out across public reporting and sensors."
          />
          <Step
            n="02"
            title="Get a clear call"
            body="Looks trustworthy, still forming, thin so far, or sources clash — with both sides when they disagree."
          />
          <Step
            n="03"
            title="Level up"
            body="Daily missions, streaks, and ranks from Newcomer to Guardian. Stay sharp without doomscrolling."
          />
        </ol>
      </section>

      {/* Sample verdicts — not card-heavy hero; secondary section */}
      <section>
        <div className="mb-6 max-w-2xl">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-flare">
            In the wild
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            What Crosscheck actually says
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <VerdictDemo
            band="Looks trustworthy"
            tone="good"
            title="Central bank holds rates — wires match"
            body="Seven independent outlets agree on the decision and timing. Safe to treat the core fact as solid."
          />
          <VerdictDemo
            band="Sources clash"
            tone="clash"
            title="Quake reported 6.2 vs 5.8"
            body="USGS and regional sensors disagree on magnitude. Both readings are shown with citations — don't round it off yet."
          />
        </div>
      </section>

      {/* Ranks teaser */}
      <section className="overflow-hidden rounded-[32px] border border-ink-100 bg-ink-900 px-5 py-8 text-white sm:px-8 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-signal-300">
              Progress
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Climb from Newcomer to Guardian
            </h2>
            <p className="mt-2 text-sm text-white/70">
              Verify claims, scout stories, inspect clashes. XP and streaks keep you honest — not addicted.
            </p>
          </div>
          <Link
            href="/login?next=/dashboard"
            className="inline-flex rounded-2xl bg-signal px-5 py-3 text-sm font-semibold text-white hover:bg-signal-600"
          >
            Start free · keep your streak
          </Link>
        </div>
        <ul className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {['Newcomer', 'Citizen', 'Watchdog', 'Truth Hunter', 'Sentinel', 'Guardian'].map((rank, i) => (
            <li
              key={rank}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center"
            >
              <p className="text-[10px] uppercase tracking-wider text-white/45">Rank {i + 1}</p>
              <p className="mt-1 font-display text-sm font-semibold">{rank}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Topics */}
      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Browse by topic
            </h2>
            <p className="mt-1 text-sm text-ink-500">Jump into today&apos;s live coverage.</p>
          </div>
          <Link href="/feed" className="text-sm font-semibold text-signal hover:text-signal-600">
            See all
          </Link>
        </div>
        <ul className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible lg:grid-cols-6">
          {TOPIC_TILES.map((t) => (
            <li key={t.slug} className="snap-start">
              <Link
                href={`/feed?topic=${t.slug}`}
                className="group flex w-40 flex-col overflow-hidden rounded-[22px] border border-ink-100 bg-paper shadow-card transition hover:shadow-card-hover sm:w-auto"
              >
                <span className={`block h-24 ${t.tile} sm:h-28`} aria-hidden="true" />
                <span className="flex items-center justify-between gap-2 px-3 py-3">
                  <span>
                    <span className="block text-sm font-semibold text-ink">{t.label}</span>
                    <span className="text-[11px] uppercase tracking-wider text-ink-400">{t.kicker}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-signal text-white transition group-hover:bg-signal-600"
                  >
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* People use cases */}
      <section>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Built for anyone who wants the truth
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          <UseCase
            title="That headline in your group chat"
            body="Someone just shared something shocking. Thirty seconds here before you react or repost."
          />
          <UseCase
            title="When the news feels like spin"
            body="We flag loaded language and one-sided framing so you can see the slant instead of absorbing it."
          />
          <UseCase
            title="Breaking news you can't trust yet"
            body="Early reports swing. We show which details look solid and which are still moving."
          />
        </div>
      </section>

      {!signedIn && (
        <section className="rounded-[32px] border border-ink-100 bg-paper px-5 py-7 shadow-card sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-flare">
                Free forever
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
                Create your account. Keep your progress.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-ink-500">
                Personalized feed, missions, and AI-grounded verifications. Secure by default — not locked behind invite walls.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/login?next=/dashboard"
                className="rounded-2xl bg-flare px-5 py-2.5 text-sm font-semibold text-white hover:bg-flare-600"
              >
                Sign up
              </Link>
              <Link
                href="/login?next=/dashboard"
                className="rounded-2xl border border-ink-100 bg-canvas-50 px-5 py-2.5 text-sm font-medium text-ink hover:border-ink-200"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="relative border-t border-ink-200 pt-4">
      <p className="font-display text-sm font-semibold text-signal">{n}</p>
      <h3 className="mt-2 font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">{body}</p>
    </li>
  );
}

function VerdictDemo({
  band,
  tone,
  title,
  body,
}: {
  band: string;
  tone: 'good' | 'clash';
  title: string;
  body: string;
}) {
  const toneClass =
    tone === 'good'
      ? 'border-signal/30 bg-signal/5 text-signal-700'
      : 'border-flare/30 bg-flare/5 text-flare-700';
  return (
    <article className="rounded-[28px] border border-ink-100 bg-paper p-5 shadow-card">
      <p className={`inline-flex rounded-xl px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${toneClass}`}>
        {band}
      </p>
      <h3 className="mt-3 font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">{body}</p>
    </article>
  );
}

function UseCase({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-t border-ink-200 pt-4">
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">{body}</p>
    </div>
  );
}
