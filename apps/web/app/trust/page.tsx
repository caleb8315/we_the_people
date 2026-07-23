import { Badge } from '@/components/ui/badge';

export const metadata = { title: 'Methodology · Crosscheck' };

export default function TrustPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-ink-600">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Methodology</h1>
        <p className="mt-2 text-ink-600">
          Crosscheck shows three things per event: how public reporting agrees, where it
          conflicts, and which pieces of evidence are missing. This page explains the labels
          and how they&apos;re derived.
        </p>
      </header>

      <section className="mb-8 rounded-lg bg-gray-50 p-6">
        <h2>Our promise</h2>
        <p>
          Crosscheck doesn&apos;t tell you what to think. We tell you what&apos;s confirmed, what&apos;s
          contested, and where someone might be trying to manipulate the story. Then you decide.
          Every score, label, and AI summary links back to the original sources — no black boxes,
          no hidden verdicts.
        </p>
      </section>

      <section>
        <h2>Reliability labels</h2>
        <p className="text-ink-600">
          A reliability label reflects how many independent, credible public sources are
          reporting the same underlying event. Stronger labels mean stronger support for
          the core event, while lower labels mean details are still uncertain.
        </p>
        <ul>
          <li>
            <Badge variant="verified">Corroborated</Badge> At least two credible, independent
            sources report the event consistently.
          </li>
          <li>
            <Badge variant="developing">Developing</Badge> Reported by at least one credible
            source, but not yet independently corroborated by two or more credible outlets. Treat with caution.
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
        <p className="text-ink-600">
          A composite 0–100 score derived from four dimensions — agreement across sources,
          independence of domains, strength of physical evidence, and narrative divergence.
          The score is mapped to a public label:
        </p>
        <ul>
          <li>
            <strong>Looks trustworthy (70+).</strong> Strong agreement across credible,
            independent sources — often with supporting sensor evidence.
          </li>
          <li>
            <strong>Still unclear (40–69).</strong> Enough to surface; corroboration may still
            be forming or sensor support may be partial.
          </li>
          <li>
            <strong>Weak support (&lt; 40).</strong> Thin coverage. Read the underlying reports
            before relying on the event.
          </li>
        </ul>
        <p className="text-xs text-ink-500">
          &quot;Looks trustworthy&quot; means independent reporting strongly supports the event.
          Some details can still move as coverage develops.
        </p>
      </section>

      <section id="source-disagreement">
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

      <section id="ai-transparency">
        <h2>Where AI is and is not used</h2>
        <p className="text-ink-600">
          Crosscheck uses AI as an assistant around the verification core. The deterministic reliability scorer, the source-disagreement
          detector, the corroboration scorer, the confidence band, and every label you see
          on a card or signal page are computed without an LLM call.
        </p>
        <p className="mt-2 text-ink-600">
          AI is used in narrow, evidence-bound places, all of which fall back to deterministic
          copy if the AI provider is unavailable, the budget is exhausted, or the user has hit
          their daily limit:
        </p>
        <ul>
          <li>
            <strong>Briefings</strong> — the daily and personal briefings use AI to write a
            short, structured narrative on top of the same source counts and disagreement
            records you can see in the deterministic evidence list at the bottom of every
            briefing.
          </li>
          <li>
            <strong>Per-user analyst chat</strong> — the AI workspace answers questions about
            the live feed it has been shown. It is grounded in your own signals, sources, and
            briefings; it does not browse the web independently.
          </li>
          <li>
            <strong>Optional story enrichment</strong> — the &quot;Develop this story&quot;
            button can fan out across web, Reddit, Bluesky, GDELT and Wikipedia to surface
            additional public sources for an existing signal. The retrieval is non-LLM; AI
            only summarises what was already retrieved.
          </li>
        </ul>
        <p className="mt-2 text-ink-600">
          AI in Crosscheck never:
        </p>
        <ul>
          <li>writes or overrides a signal&apos;s reliability label, confidence band, or verification status;</li>
          <li>creates a parallel scoring system outside the deterministic core;</li>
          <li>invents evidence or conclusions not supported by the cited sources;</li>
          <li>accuses a person, group, or state of anything;</li>
          <li>frames a sensor network&apos;s lack of detection as evidence the event did not happen;</li>
          <li>claims to have read content behind paywalls or classified sources.</li>
        </ul>
        <p className="mt-2 text-ink-600">
          AI can still make mistakes. Every assistant-generated line is paired with a deeper
          surface — the evidence list, the source-disagreement comparison, the physical
          evidence record, or this page — so you can inspect the underlying sources directly.
          When in doubt, treat the deterministic evidence as authoritative and the AI line as
          a reading guide.
        </p>
      </section>

      <section>
        <h2>What Crosscheck does not do</h2>
        <ul>
          <li>It does not replace primary reporting. It summarizes evidence and links you to sources.</li>
          <li>It does not accuse. Conflicts are shown with both sides and citations.</li>
          <li>It does not use classified sources or paywalled content.</li>
          <li>It does not investigate people, geolocate imagery, or produce dossiers.</li>
        </ul>
      </section>
    </article>
  );
}
