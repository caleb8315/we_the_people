import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase-server';
import { Card } from '@/components/ui/card';

export const metadata = {
  title: 'Crosscheck — see where reporting agrees, conflicts, and lacks evidence',
};

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
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300">
          Source consistency
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          See where reporting agrees, conflicts, and lacks evidence.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-white/75 sm:text-lg">
          Crosscheck reads public reporting and open sensor networks (seismic, satellite, weather,
          market, cyber), clusters them by event, and shows three things for each: how sources
          agree, where they conflict, and which pieces of evidence are missing. No scoring of
          right and wrong — only visibility into the shape of the reporting.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={signedIn ? '/dashboard' : '/login'}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-white/90"
          >
            {signedIn ? 'Open dashboard' : 'Get your workspace'}
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
            Methodology
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Feature
          title="Agreement"
          body="Cluster public reports by event, show how many independent credible sources are telling the same story, and mark the parts that line up across all of them."
        />
        <Feature
          title="Conflicts"
          body="Surface numeric mismatches, cause disagreements, and presence vs. absence discrepancies between sources — with a one-line summary and direct citations."
        />
        <Feature
          title="Evidence gaps"
          body="Report when seismic, satellite, or weather-service sensor data supports a claim, and just as clearly when it doesn't. Limitations are always stated alongside."
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card title="What you get after sign-in">
          <ul className="space-y-2 text-sm text-white/80">
            <li>Personal dashboard with your focus topics and alert thresholds</li>
            <li>Priority workspace for high-severity, well-corroborated signals</li>
            <li>Source control panel with credibility tiers and mute controls</li>
            <li>Per-account AI analyst sessions and chat memory</li>
            <li>Daily personal briefings (email + in-app archive)</li>
          </ul>
        </Card>
        <Card title="What Crosscheck is not">
          <p className="text-sm text-white/80">
            Crosscheck is not an OSINT investigation tool and not a news app. It doesn&apos;t tell
            you what happened — it tells you how the public record about an event is or
            isn&apos;t lining up across sources and sensor evidence. Every signal is traceable
            to the underlying reports; every disagreement is shown with both sides.
          </p>
          <div className="mt-4">
            <Link href="/about" className="text-sm text-brand-300 underline">
              Read what this is and isn&apos;t
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
