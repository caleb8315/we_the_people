import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase-server';

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
    <div className="space-y-20">
      <section className="space-y-7 rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] p-8 sm:p-10">
        <p className="text-xs uppercase tracking-widest text-white/50">OSINT Platform</p>
        <h1 className="max-w-4xl text-4xl sm:text-5xl font-semibold tracking-tight">
          Evidence-first global intelligence for analysts, journalists, and operators.
        </h1>
        <p className="max-w-3xl text-lg text-white/70">
          We combine world news, weather alerts, seismic activity, market stress, disaster feeds, and open event data
          into a transparent intelligence graph. Every claim is traceable. Every signal has confidence and source evidence.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={signedIn ? '/dashboard' : '/login'} className="rounded bg-white text-black px-4 py-2 font-medium">
            {signedIn ? 'Dashboard' : 'Get your dashboard'}
          </Link>
          <Link href="/feed" className="rounded border border-white/20 px-4 py-2">Explore live feed</Link>
          <Link href="/trust" className="rounded border border-white/20 px-4 py-2">Trust & methodology</Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <Card
          title="Trust by design"
          body="We do not make accusations. We surface inconsistencies with citations, confidence labels, and clear verification states."
        />
        <Card
          title="User-owned workspace"
          body="Each account has isolated preferences, isolated AI memory, and isolated briefing delivery. No shared user data."
        />
        <Card
          title="Beyond headlines"
          body="We ingest free public sources across geopolitical, weather, seismic, cyber, and market domains to reduce blind spots."
        />
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-lg font-semibold">What you get after sign-in</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            <li>• Personal dashboard with your focus topics and alert thresholds</li>
            <li>• Dedicated Intel workspace for high-severity, high-confidence signals</li>
            <li>• Source control panel with credibility and mute controls</li>
            <li>• User-specific AI analyst sessions and chat memory</li>
            <li>• Daily user-specific briefings (email + in-app archive)</li>
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-lg font-semibold">CEO-proof positioning</h2>
          <p className="mt-3 text-sm text-white/70">
            Position this platform as an evidence-backed, privacy-first intelligence layer for public-interest decision making.
            It is built for measurable trust: source-open rates, useful-alert ratios, and retention by cohort.
          </p>
          <div className="mt-4">
            <Link href="/about" className="text-sm underline">Read mission and boundaries</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-white/70">{body}</p>
    </div>
  );
}
