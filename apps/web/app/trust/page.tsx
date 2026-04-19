import { Badge } from '@/components/ui/badge';

export const metadata = { title: 'Trust & Methodology · OSINT Platform' };

export default function TrustPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-white/80">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Trust & methodology</h1>
        <p className="mt-2 text-white/70">
          Every signal is an aggregation of one or more public reports. Here is what the labels mean and how we avoid
          accusing anyone.
        </p>
      </header>

      <section>
        <h2>Verification states</h2>
        <ul>
          <li>
            <Badge variant="verified">verified</Badge> At least two credible, independent sources corroborate the event.
          </li>
          <li>
            <Badge variant="developing">developing</Badge> Multiple sources reference it, or at least one credible
            source; corroboration is partial.
          </li>
          <li>
            <Badge variant="unverified">unverified</Badge> Reported but not yet corroborated.
          </li>
          <li>
            <Badge variant="quarantined">quarantined</Badge> Withheld from alerts (e.g. policy/legal language with no
            observed kinetic evidence).
          </li>
        </ul>
      </section>

      <section>
        <h2>Confidence labels</h2>
        <ul>
          <li><strong>High (75+).</strong> Multiple credible sources, consistent reporting.</li>
          <li><strong>Medium (45–74).</strong> Enough evidence to surface; verification may still be developing.</li>
          <li><strong>Low (&lt; 45).</strong> Caveat-heavy. Read the evidence before treating as fact.</li>
        </ul>
      </section>

      <section>
        <h2>Inconsistency signals</h2>
        <p>
          When reports disagree on a material dimension (e.g. casualty count, ceasefire vs active kinetic activity), we
          flag an inconsistency with the specific claim, the observation, and the sources for each. We never assert
          intent or motive — we illustrate the mismatch.
        </p>
      </section>

      <section>
        <h2>Source credibility</h2>
        <p>
          We bootstrap with widely-cited international wire/reporting outlets and scientific sensor networks. You can
          mute any source in Settings. Credibility is not a political judgment — it is a rolling weighting based on
          corroboration behavior.
        </p>
      </section>
    </article>
  );
}
