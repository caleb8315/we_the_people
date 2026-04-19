import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase-server';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'OSINT Platform — Transparent Intelligence' };

export default async function LandingPage() {
  let signedIn = false;
  try {
    const sb = getServerSupabase();
    const { data } = await sb.auth.getUser();
    signedIn = !!data.user;
  } catch {
    // Anonymous fallback when env/auth isn't available.
  }

  return (
    <div className="space-y-16">
      <section className="rounded-card border border-white/10 bg-gradient-to-br from-brand-500/10 via-white/5 to-transparent p-6 sm:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300">Transparent intelligence</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Evidence-first global intelligence for analysts, journalists, and operators.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-white/75 sm:text-lg">
          News, weather alerts, seismic activity, market stress, disaster feeds, and open event data combined into a
          transparent intelligence graph. Every claim is traceable. Every signal has confidence and source evidence.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={signedIn ? '/dashboard' : '/login'}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-white/90"
          >
            {signedIn ? 'Open dashboard' : 'Get your dashboard'}
          </Link>
          <Link
            href="/feed"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm hover:border-white/35"
          >
            Explore live feed
          </Link>
          <Link
            href="/trust"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm hover:border-white/35"
          >
            Trust & methodology
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Feature
          title="Trust by design"
          body="We do not accuse. We surface inconsistencies with citations, confidence labels, and clear verification states."
        />
        <Feature
          title="Owned workspace"
          body="Each account has isolated preferences, isolated AI memory, and isolated briefing delivery. No shared user data."
        />
        <Feature
          title="Beyond headlines"
          body="Free public sources across geopolitical, weather, seismic, cyber, and market domains to reduce blind spots."
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card title="What you get after sign-in">
          <ul className="space-y-2 text-sm text-white/80">
            <li>Personal dashboard with your focus topics and alert thresholds</li>
            <li>Dedicated Intel workspace for high-severity, high-confidence signals</li>
            <li>Source control panel with credibility and mute controls</li>
            <li>User-specific AI analyst sessions and chat memory</li>
            <li>Daily user-specific briefings (email + in-app archive)</li>
          </ul>
        </Card>
        <Card title="Positioning">
          <p className="text-sm text-white/80">
            Evidence-backed, privacy-first intelligence for public-interest decision making. Built for measurable
            trust: source-open rates, useful-alert ratios, and retention by cohort.
          </p>
          <div className="mt-4">
            <Link href="/about" className="text-sm text-brand-300 underline">
              Read mission and boundaries
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-white/70">{body}</p>
    </div>
  );
}
