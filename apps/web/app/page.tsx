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
    <div className="space-y-10 sm:space-y-14">
      {/* ── Hero ── */}
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
          Evidence comparison platform
        </p>
        <h1 className="mt-3 max-w-3xl text-[40px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[56px]">
          Is it propaganda? Is it real? Find out.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-ink-500 sm:text-lg">
          Crosscheck reads the news so you don&apos;t get played. Paste any headline, claim, or URL
          and we&apos;ll tell you if it holds up, where it&apos;s being twisted, and what you can safely
          share.
        </p>

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

      {/* ── How it works — step-by-step proof of the pipeline ── */}
      <section>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
            How it works
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            From raw signals to structured intelligence in four steps
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-ink-500">
            Every output links back to its source. No black boxes.
          </p>
        </div>
        <div className="mt-8 grid gap-px overflow-hidden rounded-card border border-ink-100 bg-ink-100 sm:grid-cols-4">
          <HowItWorksStep
            step={1}
            title="Ingest"
            body="RSS feeds, APIs, sensor networks, and public bulletins are ingested continuously. Each source is graded for credibility and independence."
            icon={IngestIcon}
          />
          <HowItWorksStep
            step={2}
            title="Compare"
            body="Claims are cross-referenced across sources. The system scores agreement, flags contradictions, and classifies conflict types — timeline mismatch, framing difference, or direct contradiction."
            icon={CompareIcon}
          />
          <HowItWorksStep
            step={3}
            title="Score & explain"
            body="A severity score, confidence band, and source breakdown are computed deterministically. AI adds plain-language explanation, grounded entirely in the same evidence."
            icon={ScoreIcon}
          />
          <HowItWorksStep
            step={4}
            title="Deliver"
            body="Structured briefings, personalized feeds, and priority alerts are delivered based on your settings. Every piece traces back to its original source."
            icon={DeliverIcon}
          />
        </div>
      </section>

      {/* ── Platform in action — simulated example output ── */}
      <section>
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
            Platform in action
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            See what Crosscheck actually produces
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            Real outputs from the platform — not mockups.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ExampleOutput
            label="Signal card"
            title="Earthquake magnitude reported at 6.2 by USGS, 5.8 by regional sensors"
            severity={78}
            status="disputed"
            details={[
              { label: 'Sources agree', value: '3 of 5' },
              { label: 'Conflict type', value: 'Measurement variance' },
              { label: 'Confidence', value: '72%' },
            ]}
          />
          <ExampleOutput
            label="Signal card"
            title="Central bank holds rates steady — consensus across wire services"
            severity={45}
            status="corroborated"
            details={[
              { label: 'Sources agree', value: '7 of 7' },
              { label: 'Conflict type', value: 'None detected' },
              { label: 'Confidence', value: '94%' },
            ]}
          />
        </div>
        <div className="mt-4 rounded-card border border-amber-200/60 bg-gradient-to-br from-amber-50/60 via-paper to-paper p-5 shadow-card sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">
            Sample briefing section
          </p>
          <h3 className="mt-1.5 text-base font-semibold text-ink">What is widely supported</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Supported</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
                Multiple wire services confirm the ceasefire agreement was signed. Reuters, AP, and AFP all
                carry matching timelines with independent sourcing from diplomatic officials present at the talks.
              </p>
            </div>
            <div className="rounded-lg border border-danger-200 bg-danger-50/70 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-danger-700">Disputed</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
                Troop withdrawal timelines differ: state media reports 48 hours, while two independent
                monitors cite &ldquo;no specific date agreed.&rdquo; One regional outlet reports a 72-hour window,
                citing unnamed military sources.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Link
              href="/briefings"
              className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(245,158,11,0.55)] hover:bg-amber-600"
            >
              Read live briefings
            </Link>
            <span className="text-xs text-ink-400">Updated every ingest cycle</span>
          </div>
        </div>
      </section>

      {/* ── What you get — feature quartet ── */}
      <section>
        <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          What Crosscheck gives you
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Feature
            title="Comparison"
            body="Rank every source by credibility, directness, recency, and independence — with a short rationale for why each one ranks where it does."
            icon={CompareIcon}
          />
          <Feature
            title="Conflicts, classified"
            body="Distinguish direct contradiction, framing differences, timeline mismatches, missing context, and insufficient evidence — each with a numeric severity score."
            icon={ConflictIcon}
          />
          <Feature
            title="Bias as a signal"
            body="Detect loaded language, one-sided framing, selective-omission cues, and emotional tone — kept strictly separate from the truth/comparison verdict."
            icon={BiasIcon}
          />
          <Feature
            title="Transparency"
            body="Every confidence score breaks down into source agreement, source quality, claim directness, and evidence completeness — with a 'Why this result?' section."
            icon={TransparencyIcon}
          />
        </div>
      </section>

      {/* ── Topic browser ── */}
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

      <section>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
            Built for anyone who wants the truth
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Built for anyone who wants the truth
          </h2>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <UseCaseCard
            title="That headline in your group chat"
            body="Someone just shared something shocking. Before you react or repost, check it here. 30 seconds to know if it's real."
            icon={NewsroomIcon}
          />
          <UseCaseCard
            title="When the news feels like spin"
            body="We flag when outlets are choosing words or angles that other sources don't use so you can see bias instead of absorbing it."
            icon={AnalystIcon}
          />
          <UseCaseCard
            title="Breaking news you can't verify"
            body="Early reports are often wrong or incomplete. We show which details are confirmed and which are still moving."
            icon={NgoIcon}
          />
        </div>
      </section>

      {/* ── AI as evidence assistant ── */}
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

      {/* ── Transparency commitments — building trust ── */}
      <section>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
            Transparency commitments
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Every claim is traceable. Every score is explainable.
          </h2>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TransparencyCard
            title="Source traces"
            body="Every signal links to the original reports. Click through to see the raw source, not just our summary."
          />
          <TransparencyCard
            title="Confidence breakdown"
            body="Scores decompose into source agreement, source quality, claim directness, and evidence completeness. Nothing is a single opaque number."
          />
          <TransparencyCard
            title="AI guardrails"
            body="AI never claims 'verified' or 'fact-checked.' Every AI surface falls back to deterministic, LLM-free copy if the model is unavailable."
          />
          <TransparencyCard
            title="Bias separation"
            body="Bias detection is structurally separate from truth assessment. Framing, tone, and omission signals appear alongside — never embedded in — the comparison verdict."
          />
          <TransparencyCard
            title="Open methodology"
            body="Scoring algorithms, conflict classification rules, and credibility tiers are documented publicly. Read the methodology at any time."
          />
          <TransparencyCard
            title="Correction log"
            body="When the platform gets something wrong, it is logged publicly in the corrections page. Accountability is a feature, not an afterthought."
          />
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/trust"
            className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-700"
          >
            Read full methodology
          </Link>
          <Link
            href="/corrections"
            className="rounded-full border border-ink-100 bg-paper px-5 py-2.5 text-sm font-medium text-ink-500 hover:text-ink"
          >
            View corrections log
          </Link>
        </div>
      </section>

      {/* ── Private beta access ── */}
      {!signedIn && (
        <section className="grid gap-5 rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:grid-cols-[1.1fr_0.9fr] sm:p-6">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
              Get early access
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Get early access</h2>
            <p className="max-w-xl text-sm text-ink-500">
              Crosscheck is in private beta. Request access and we&apos;ll let you in.
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
    </div>
  );
}

/* ── Sub-components ── */

function LiveStat({
  value,
  label,
  icon: Icon,
}: {
  value: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-ink-100 bg-paper p-4 shadow-card sm:p-5">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-semibold tabular-nums text-ink sm:text-3xl">
          {value > 0 ? value.toLocaleString() : '—'}
        </p>
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-400">{label}</p>
      </div>
    </div>
  );
}

function HowItWorksStep({
  step,
  title,
  body,
  icon: Icon,
}: {
  step: number;
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="relative bg-paper p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">
          {step}
        </span>
        <Icon className="h-5 w-5 text-ink-400" />
      </div>
      <h3 className="mt-3 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">{body}</p>
    </div>
  );
}

function ExampleOutput({
  label,
  title,
  severity,
  status,
  details,
}: {
  label: string;
  title: string;
  severity: number;
  status: 'corroborated' | 'disputed';
  details: Array<{ label: string; value: string }>;
}) {
  const isDisputed = status === 'disputed';
  const accentBorder = isDisputed ? 'border-amber-200' : 'border-emerald-200';
  const accentBg = isDisputed ? 'from-amber-50/60' : 'from-emerald-50/60';
  const pillTone = isDisputed
    ? 'bg-amber-100 text-amber-700'
    : 'bg-emerald-100 text-emerald-700';
  const severityTone = severity >= 70 ? 'text-amber-700' : 'text-emerald-700';

  return (
    <div className={`rounded-card border ${accentBorder} bg-gradient-to-br ${accentBg} via-paper to-paper p-5 shadow-card`}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">
        <span>{label}</span>
        <span className={`rounded-full px-2 py-0.5 ${pillTone}`}>{status}</span>
      </div>
      <h3 className="mt-2 text-[15px] font-semibold leading-snug text-ink">{title}</h3>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex flex-col items-center rounded-lg bg-paper/80 px-3 py-2 shadow-sm">
          <span className={`text-2xl font-semibold tabular-nums ${severityTone}`}>{severity}</span>
          <span className="text-[9px] font-medium uppercase tracking-wider text-ink-400">severity</span>
        </div>
        <dl className="flex-1 space-y-1">
          {details.map((d) => (
            <div key={d.label} className="flex items-center justify-between text-xs">
              <dt className="text-ink-400">{d.label}</dt>
              <dd className="font-medium text-ink-700">{d.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function UseCaseCard({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-card border border-ink-100 bg-paper p-5 shadow-card">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-3 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">{body}</p>
    </div>
  );
}

function TransparencyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-ink-100 bg-paper p-5 shadow-card">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{body}</p>
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

function Feature({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-card border border-ink-100 bg-paper p-5 shadow-card">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <h3 className="mt-3 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-ink-500">{body}</p>
    </div>
  );
}

/* ── Icons ── */

function SignalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h.01" /><path d="M7 20v-4" /><path d="M12 20v-8" /><path d="M17 20V8" /><path d="M22 4v16" />
    </svg>
  );
}

function SourceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
  );
}

function BriefingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z" /><path d="M4 10h16" /><path d="M10 4v16" />
    </svg>
  );
}

function TopicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" />
    </svg>
  );
}

function IngestIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function CompareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M12 22v-8.3a4 4 0 0 0-1.17-2.83L3 3" /><path d="m21 3-7.83 7.83A4 4 0 0 0 12 13.66V22" />
    </svg>
  );
}

function ScoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 4.5 3.3 8.3 8 9 4.7-.7 8-4.5 8-9V6l-8-3z" /><path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function DeliverIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function ConflictIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" />
    </svg>
  );
}

function BiasIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
    </svg>
  );
}

function TransparencyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function NewsroomIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10" /><path d="M7 12h10" /><path d="M7 16h6" />
    </svg>
  );
}

function AnalystIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function NgoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
