import { Badge } from '@/components/ui/badge';

export const metadata = { title: 'Methodology · Crosscheck' };

export default function TrustPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-white/80">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Methodology</h1>
        <p className="mt-2 text-white/70">
          Crosscheck shows three things per event: how public reporting agrees, where it
          conflicts, and which pieces of evidence are missing. This page explains the labels
          and how they&apos;re derived.
        </p>
      </header>

      <section>
        <h2>Reliability labels</h2>
        <p className="text-white/70">
          A reliability label reflects how many independent, credible public sources are
          reporting the same underlying event. It is a description of coverage, not an
          assessment of whether the event occurred.
        </p>
        <ul>
          <li>
            <Badge variant="verified">Corroborated</Badge> At least two credible, independent
            sources report the event consistently.
          </li>
          <li>
            <Badge variant="developing">Developing</Badge> Multiple sources reference the
            event, or at least one credible source does, but corroboration is still partial.
          </li>
          <li>
            <Badge variant="unverified">Single-source</Badge> Reported by one source so far.
            Awaiting corroboration from additional independent outlets.
          </li>
          <li>
            <Badge variant="quarantined">Flagged</Badge> Withheld from alerts pending review —
            for example, policy or legal language with no observed on-the-ground evidence.
          </li>
        </ul>
      </section>

      <section>
        <h2>Reliability score</h2>
        <p className="text-white/70">
          A composite 0–100 score derived from four dimensions — agreement across sources,
          independence of domains, strength of physical evidence, and narrative divergence.
          The score is mapped to a public label:
        </p>
        <ul>
          <li>
            <strong>Likely accurate (70+).</strong> Corroborated across credible, independent
            sources with supporting sensor evidence.
          </li>
          <li>
            <strong>Unclear (40–69).</strong> Enough evidence to surface; corroboration may be
            developing or sensor support may be partial.
          </li>
          <li>
            <strong>Likely unreliable (&lt; 40).</strong> Caveat-heavy. Read the underlying
            reports before relying on the event.
          </li>
        </ul>
        <p className="text-xs text-white/60">
          &quot;Likely accurate&quot; describes how well the reporting is corroborated — it is
          not a judgment about the event itself.
        </p>
      </section>

      <section>
        <h2>Source disagreement</h2>
        <p>
          When reports disagree on a material detail — casualty counts, cause (accident vs.
          deliberate strike), or presence vs. absence of activity — Crosscheck surfaces the
          mismatch: the specific claim, the observation, and the sources for each. Both sides
          are shown with citations so readers can weigh them directly.
        </p>
      </section>

      <section>
        <h2>Physical evidence</h2>
        <p>
          For events where sensor networks are relevant (seismic, satellite, weather), the
          signal carries a structured physical-evidence record with one of three statuses —
          <strong> confirmed</strong>, <strong> partial</strong>, or <strong> none detected</strong> —
          plus the sources that contributed and the limitations that apply (e.g. satellite
          revisit cadence, cloud cover, sub-magnitude-4 seismic sensitivity). &quot;None
          detected&quot; describes sensor coverage for the current window — it does not
          describe what happened.
        </p>
      </section>

      <section>
        <h2>Source credibility</h2>
        <p>
          Credibility is a rolling weighting based on how consistently a source corroborates
          with others. It is not a political judgment. Bootstrap sources are widely-cited
          international wire outlets and scientific sensor networks; you can mute any source
          in Settings, and the feed honours that choice everywhere.
        </p>
      </section>

      <section>
        <h2>What Crosscheck does not do</h2>
        <ul>
          <li>It does not tell you what happened. It describes how the public record is shaped.</li>
          <li>It does not accuse. Conflicts are shown with both sides and citations.</li>
          <li>It does not use classified sources or paywalled content.</li>
          <li>It does not investigate people, geolocate imagery, or produce dossiers.</li>
        </ul>
      </section>
    </article>
  );
}
