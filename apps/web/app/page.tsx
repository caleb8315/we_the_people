import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata = {
  title: 'Crosscheck — see where reporting agrees, conflicts, and lacks evidence',
};

export default async function LandingPage() {
  let signedIn = false;
  try {
    const sb = getServerSupabase();
    const { data } = await sb.auth.getUser();
    signedIn = !!data.user;
  } catch {}

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5">
          <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse-slow" />
          <span className="text-xs font-medium text-brand-400">Monitoring 45+ sources in real time</span>
        </div>

        {/* Hero */}
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          See the full
          <br />
          <span className="bg-gradient-to-r from-brand-400 to-emerald-300 bg-clip-text text-transparent">
            picture.
          </span>
        </h1>

        <p className="mx-auto max-w-lg text-lg text-zinc-400">
          Crosscheck monitors public reporting and sensor networks, shows where sources agree
          and disagree, and researches the claims — so you can decide what to believe.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/feed"
            className="rounded-full bg-brand-500 px-8 py-3 text-sm font-semibold text-black transition hover:bg-brand-400 hover:shadow-glow"
          >
            Explore live feed
          </Link>
          <Link
            href="/verify"
            className="rounded-full border border-zinc-700 px-8 py-3 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            Verify an article
          </Link>
        </div>

        {/* Feature strip */}
        <div className="grid grid-cols-3 gap-6 pt-8 text-left">
          <FeatureBlock
            number="01"
            title="Agreement"
            desc="How many independent sources report the same event the same way."
          />
          <FeatureBlock
            number="02"
            title="Conflicts"
            desc="Where sources disagree on numbers, causes, or key facts — shown side by side."
          />
          <FeatureBlock
            number="03"
            title="Evidence"
            desc="Whether USGS, NASA, or NOAA sensors have data that confirms or contradicts the reporting."
          />
        </div>
      </div>
    </div>
  );
}

function FeatureBlock({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-mono text-brand-500">{number}</span>
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      <p className="text-xs leading-relaxed text-zinc-500">{desc}</p>
    </div>
  );
}
