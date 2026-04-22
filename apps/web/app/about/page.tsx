export const metadata = { title: 'About · Crosscheck' };

export default function AboutPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-ink-600">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">About Crosscheck</h1>
        <p className="mt-2 text-ink-600">
          See where reporting agrees, conflicts, and lacks evidence.
        </p>
      </header>

      <section>
        <h2>What Crosscheck does</h2>
        <p>
          Crosscheck reads public reporting and open sensor networks — seismic (USGS), satellite
          (NASA EONET), weather (NOAA), market, and cyber feeds — and clusters them by event.
          For each event it shows three things:
        </p>
        <ul>
          <li>
            <strong>Agreement.</strong> How many independent credible sources describe the event
            the same way.
          </li>
          <li>
            <strong>Conflicts.</strong> The specific points where sources disagree — numbers,
            cause, or presence — with a one-line summary and both underlying citations.
          </li>
          <li>
            <strong>Evidence gaps.</strong> Whether sensor networks confirm, partially support,
            or have not detected physical evidence, alongside the coverage limitations that
            apply (e.g. satellite revisit cadence, cloud cover, sub-magnitude-4 seismic
            sensitivity).
          </li>
        </ul>
      </section>

      <section>
        <h2>What Crosscheck is not</h2>
        <ul>
          <li>
            <strong>Not an OSINT investigation tool.</strong> It does not geolocate imagery,
            build dossiers on people, or attribute responsibility. It describes the shape of
            public reporting about events that have already been reported.
          </li>
          <li>
            <strong>Not a news app.</strong> It does not write stories, rank outlets, or pick
            winners. It shows you which sources say which things about the same event.
          </li>
          <li>
            <strong>Not a factual adjudicator.</strong> It never tells you which source is
            correct. When reports disagree, both sides are shown with citations and the reader
            is trusted to weigh them.
          </li>
        </ul>
      </section>

      <section>
        <h2>Principles</h2>
        <ul>
          <li>Public data only. No classified information. No scraping behind paywalls.</li>
          <li>
            Every signal links to its sources and includes a reliability label, confidence
            band, and — when relevant — a physical-evidence record with explicit limitations.
          </li>
          <li>Privacy-first. Minimal data retention. User-owned preferences and AI state.</li>
          <li>You control the feed. Mute sources, focus topics, set alert thresholds.</li>
        </ul>
      </section>

      <section>
        <h2>Why it&apos;s useful</h2>
        <p>
          Most news tools summarise. Most OSINT tools investigate. Very few show, at a glance,
          whether a reported event is corroborated across independent sources and whether
          physical sensor networks support the claim. Crosscheck fills that gap — a system for
          spotting when the shape of reality across sources doesn&apos;t line up, so readers
          can look into the parts that don&apos;t before making decisions about what to
          believe.
        </p>
      </section>
    </article>
  );
}
