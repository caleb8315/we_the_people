import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: `Corrections policy · ${siteConfig.name}`,
  description: 'How Crosscheck reviews correction requests, annotations, and takedown follow-up.',
};

export default function CorrectionsPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-ink-600">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Corrections policy</h1>
        <p className="mt-2 text-ink-600">
          Crosscheck does not publish verdicts. It publishes source-disagreement views and evidence
          summaries. If we misstate a source, mis-handle evidence context, or fail to annotate a
          retraction, we correct the record quickly and visibly.
        </p>
      </header>

      <section>
        <h2>How to request a correction</h2>
        <p>
          Email{' '}
          <a className="underline" href={`mailto:${siteConfig.supportEmail}`}>
            {siteConfig.supportEmail}
          </a>{' '}
          with the signal URL, briefing URL, or screenshot of the issue. Include the specific text
          or label you believe is wrong and the source material that should replace or qualify it.
        </p>
      </section>

      <section>
        <h2>What we review</h2>
        <ul>
          <li>Incorrect quotations, timestamps, or source attributions.</li>
          <li>Missing or outdated retraction / correction context from a cited source.</li>
          <li>Evidence summaries that overstate sensor coverage or understate limitations.</li>
          <li>Policy or legal concerns that require temporary withdrawal pending review.</li>
        </ul>
      </section>

      <section>
        <h2>Response targets</h2>
        <ul>
          <li>Receipt acknowledgement within 2 business days.</li>
          <li>High-severity safety or defamation concerns reviewed the same day when possible.</li>
          <li>Resolved items are annotated in-product and reflected in the changelog when public-facing.</li>
        </ul>
      </section>

      <section>
        <h2>How corrections appear</h2>
        <p>
          When a signal or briefing needs qualification, Crosscheck updates the wording and adds a
          visible note describing what changed. If a row is withdrawn pending review, it is
          suppressed from alerts and annotated once restored or retired.
        </p>
      </section>
    </article>
  );
}
