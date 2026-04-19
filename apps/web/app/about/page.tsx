export const metadata = { title: 'About · OSINT Platform' };

export default function AboutPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-white/80">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">About</h1>
        <p className="mt-2 text-white/70">
          The OSINT Platform aggregates public reporting and open data streams, corroborates events across multiple
          credible sources, and surfaces inconsistencies in neutral language.
        </p>
      </header>

      <section>
        <h2>Principles</h2>
        <ul>
          <li>Public data only. No classified information. No scraping behind paywalls.</li>
          <li>Transparency-first. Every signal shows its sources and verification state.</li>
          <li>Privacy-first. Minimal data retention. User-owned preferences and AI state.</li>
          <li>You control the feed. Mute sources, focus topics, set alert thresholds.</li>
        </ul>
      </section>

      <section>
        <h2>Limitations</h2>
        <p>
          This platform cannot produce "perfect truth." It reduces noise, shows where reporting diverges, and provides
          evidence you can follow yourself. Treat every output as a pointer, not a verdict.
        </p>
      </section>
    </article>
  );
}
