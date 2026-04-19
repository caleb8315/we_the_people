export const metadata = { title: 'Trust & Methodology · OSINT Platform' };

export default function TrustPage() {
  return (
    <article className="prose-osint max-w-2xl space-y-5 text-white/80">
      <h1 className="text-2xl font-semibold tracking-tight">Trust &amp; methodology</h1>
      <p>
        Every signal is an aggregation of one or more public reports. Here is what the labels mean.
      </p>

      <h2 className="text-lg font-semibold">Verification states</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li><strong>Verified.</strong> At least two credible, independent sources corroborate the event.</li>
        <li><strong>Developing.</strong> Multiple sources reference it, or at least one credible source; corroboration is partial.</li>
        <li><strong>Unverified.</strong> Reported but not yet corroborated.</li>
        <li><strong>Quarantined.</strong> Withheld from alerts &mdash; e.g. policy/legal language with no observed kinetic evidence.</li>
      </ul>

      <h2 className="text-lg font-semibold">Confidence labels</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li><strong>High (≥ 75).</strong> Multiple credible sources, consistent reporting.</li>
        <li><strong>Medium (45–74).</strong> Enough evidence to surface; verification may still be developing.</li>
        <li><strong>Low (&lt; 45).</strong> Caveat-heavy. Read the evidence before treating as fact.</li>
      </ul>

      <h2 className="text-lg font-semibold">Inconsistency signals</h2>
      <p>
        When reports disagree on a material dimension (e.g. casualty count, ceasefire vs active kinetic
        activity), we flag an <em>inconsistency</em> with the specific claim, the observation, and the
        sources for each. We never assert intent or motive — we illustrate the mismatch.
      </p>

      <h2 className="text-lg font-semibold">Source credibility</h2>
      <p>
        We bootstrap with a small list of widely-cited international wire/reporting outlets. You can
        mute any source in Settings. Credibility is not a political judgment — it is a rolling
        weighting based on corroboration behavior.
      </p>
    </article>
  );
}
