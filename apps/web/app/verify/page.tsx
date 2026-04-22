import { VerifyForm } from './verify-form';

export const metadata = { title: 'Verify · Crosscheck' };

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Verify an article</h1>
        <p className="mt-2 text-white/70">
          Paste any news article URL. Crosscheck will extract the key claims, search for
          corroborating and contradicting evidence across public sources, check physical
          sensor networks, and show you what it finds.
        </p>
      </header>

      <VerifyForm />

      <section className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-white/60">
        <h2 className="mb-2 font-semibold text-white/80">How it works</h2>
        <ol className="list-inside list-decimal space-y-1.5">
          <li>The article is fetched and its key factual claims are extracted.</li>
          <li>For each claim, targeted searches are run across public web sources.</li>
          <li>Where relevant, physical sensor data (seismic, thermal satellite) is queried.</li>
          <li>Findings are synthesized into a per-claim assessment: supported, disputed, or unverified.</li>
          <li>The full research trail is shown — every search, every source, every sensor reading.</li>
        </ol>
        <p className="mt-3 text-white/45">
          Crosscheck does not tell you what is true. It shows you what public sources and
          sensor networks report, so you can decide for yourself.
        </p>
      </section>
    </div>
  );
}
