import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { AccessRequestForm } from '@/components/access-request-form';

export const metadata = {
  title:
    'Crosscheck — compare sources, see where they agree, where they conflict, and where bias may be shaping the story',
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
    <div className="space-y-8 sm:space-y-12">
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
          Evidence comparison platform
        </p>
        <h1 className="mt-3 max-w-3xl text-[40px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[56px]">
          Compare sources. <br className="hidden sm:block" />
          <span className="text-ink-500">See where they agree, conflict, and shape the narrative.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base text-ink-500 sm:text-lg">
          Crosscheck is not a truth detector. It is an evidence comparison platform that ranks
          sources, classifies their disagreements, surfaces bias signals separately from the
          verdict, and explains every score so you can decide what is supported, what is disputed,
          and where bias may be shaping the story.
        </p>

        {/* Search-like CTA row matching the reference's rounded input + filter button. */}
        <form action="/feed" className="mt-6 flex max-w-xl items-center gap-3">
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

        <div className="mt-5 flex flex-wrap gap-3">
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

      {/* What you get — feature quartet, now on the light canvas. */}
      <section>
        <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          What Crosscheck gives you
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Feature
            title="Comparison"
            body="Rank every source by credibility, directness, recency, and independence — with a short rationale for why each one ranks where it does."
          />
          <Feature
            title="Conflicts, classified"
            body="Distinguish direct contradiction, framing differences, timeline mismatches, missing context, and insufficient evidence — each with a numeric severity score."
          />
          <Feature
            title="Bias as a signal"
            body="Detect loaded language, one-sided framing, selective-omission cues, and emotional tone — kept strictly separate from the truth/comparison verdict."
          />
          <Feature
            title="Transparency"
            body="Every confidence score breaks down into source agreement, source quality, claim directness, and evidence completeness — with a 'Why this result?' section."
          />
        </div>
      </section>

      {/* AI as evidence assistant — the AI trust platform layer. The
          ordering is intentional: AI sits BELOW the deterministic
          "Agreement / Conflicts / Evidence gaps" core because it is an
          assistant around the verification core, never the arbiter of
          truth. This block makes the AI surfaces visible without
          overselling them. */}
      <section className="rounded-card border border-amber-200 bg-amber-50/60 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
              AI as evidence assistant
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              An analyst that explains the evidence — not a chatbot, not a fact-checker.
            </h2>
          </div>
          <Link
            href="/trust#ai-transparency"
            className="text-sm font-semibold text-amber-700 hover:text-amber-800"
          >
            Where AI is and isn&rsquo;t used →
          </Link>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-ink-600 sm:text-[15px]">
          AI explains how reporting and sensor data agree, conflict, and where evidence is missing.
          Every line is grounded in the same public sources you can inspect yourself, and every AI
          surface falls back to deterministic copy if the model is unavailable.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <AiFeature
            title="Plain-language trust card"
            body="Every signal carries a deterministic, LLM-free explanation: what's widely supported, what's disputed, and what to watch. Tested in CI to never claim 'verified facts' or 'fact-checked'."
          />
          <AiFeature
            title="Structured AI briefings"
            body="Daily and personal briefings are organised into five sections — what happened, what is supported, what is disputed, what changed, what to watch — never adjudicating the story."
          />
          <AiFeature
            title="Signal-grounded analyst"
            body="The AI workspace is grounded in your live feed and briefings. Open any signal and ask a pre-filled question with one click, instead of starting from a blank chat."
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link
            href={signedIn ? '/dashboard/ai' : '/login?next=/dashboard/ai'}
            className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-6px_rgba(245,158,11,0.55)] hover:bg-amber-600"
          >
            Open the AI analyst
          </Link>
          <Link
            href="/briefings"
            className="rounded-full border border-amber-200 bg-paper px-5 py-2 text-sm font-medium text-ink hover:border-amber-300"
          >
            See today&rsquo;s briefing
          </Link>
        </div>
      </section>

    </div>
  );
}

function AiFeature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-ink-100 bg-paper p-4 shadow-card">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">{body}</p>
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
