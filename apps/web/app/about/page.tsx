import Link from 'next/link';

export const metadata = { title: 'About · Crosscheck' };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-12 py-8">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">About Crosscheck</h1>
        <p className="text-lg text-zinc-400">
          See where reporting agrees, conflicts, and lacks evidence.
        </p>
      </header>

      <Section title="What it does">
        <p>
          Crosscheck reads public reporting and open sensor networks — seismic (USGS), satellite
          (NASA EONET, FIRMS), weather (NOAA), market, and cyber feeds — and clusters them by event.
          For each event it shows three things:
        </p>
        <ul className="mt-3 space-y-2">
          <li><strong className="text-zinc-200">Agreement.</strong> How many independent credible sources describe the event the same way.</li>
          <li><strong className="text-zinc-200">Conflicts.</strong> The specific points where sources disagree — numbers, cause, or presence — with both sides cited.</li>
          <li><strong className="text-zinc-200">Evidence.</strong> Whether sensor networks confirm, partially support, or have not detected physical evidence for the report.</li>
        </ul>
      </Section>

      <Section title="What it is not">
        <ul className="space-y-2">
          <li><strong className="text-zinc-200">Not an investigation tool.</strong> It does not geolocate imagery, build dossiers, or attribute responsibility.</li>
          <li><strong className="text-zinc-200">Not a news app.</strong> It does not write stories, rank outlets, or pick winners.</li>
          <li><strong className="text-zinc-200">Not a fact-checker.</strong> It never says which source is correct. Both sides are shown with citations.</li>
        </ul>
      </Section>

      <Section title="Why it exists">
        <p>
          Most tools summarize. Most OSINT tools investigate. Very few show, at a glance,
          whether a reported event is corroborated across independent sources and whether
          sensor networks support the claim. Crosscheck fills that gap — a system for
          spotting when the shape of reality across sources doesn&apos;t line up, so you
          can look into the parts that don&apos;t.
        </p>
      </Section>

      <div className="border-t border-zinc-800 pt-8">
        <Link href="/trust" className="text-sm text-brand-400 hover:underline">
          Read the full methodology →
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-zinc-200">{title}</h2>
      <div className="text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}
