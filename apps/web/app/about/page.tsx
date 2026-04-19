export const metadata = { title: 'About · OSINT Platform' };

export default function AboutPage() {
  return (
    <article className="prose-osint max-w-2xl space-y-5 text-white/80">
      <h1 className="text-2xl font-semibold tracking-tight">About</h1>
      <p>
        The OSINT Platform aggregates public reporting and open data streams, corroborates
        events across multiple credible sources, and surfaces inconsistencies in neutral
        language. We do not accuse — we present: claim versus observation, with citations
        and confidence.
      </p>
      <h2 className="text-lg font-semibold">Principles</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Public data only. No classified information. No scraping behind paywalls.</li>
        <li>Transparency-first. Every signal shows its sources and verification state.</li>
        <li>Privacy-first. Anonymous read by default. Magic-link auth. Minimum data retention.</li>
        <li>You control the feed. Mute sources, focus topics, set alert thresholds.</li>
      </ul>
      <h2 className="text-lg font-semibold">Limitations</h2>
      <p>
        This platform cannot produce &ldquo;perfect truth.&rdquo; It reduces noise, shows where
        reporting diverges, and provides evidence you can follow yourself. Treat every output
        as a pointer, not a verdict.
      </p>
    </article>
  );
}
