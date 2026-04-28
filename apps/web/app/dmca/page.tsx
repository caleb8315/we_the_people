import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'DMCA policy · Crosscheck',
  description: 'How to send copyright takedown and counter-notice requests to Crosscheck.',
};

export default function DmcaPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-ink-600">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">DMCA and takedown policy</h1>
        <p className="mt-2 text-ink-600">
          Crosscheck indexes public reporting and licensed/public feeds. If you believe material
          linked or displayed here infringes your copyright, send a notice and we will review it
          promptly.
        </p>
      </header>

      <section>
        <h2>Designated contact</h2>
        <p>
          Send notices to{' '}
          <a className="underline" href={`mailto:${siteConfig.legalEmail}`}>
            {siteConfig.legalEmail}
          </a>
          .
        </p>
      </section>

      <section>
        <h2>What to include in a notice</h2>
        <ul>
          <li>Your full name and contact information.</li>
          <li>The work you believe has been infringed.</li>
          <li>The exact URL on Crosscheck where the material appears.</li>
          <li>A statement that you have a good-faith belief the use is unauthorized.</li>
          <li>A statement, under penalty of perjury, that the notice is accurate.</li>
          <li>Your physical or electronic signature.</li>
        </ul>
      </section>

      <section>
        <h2>Counter-notices</h2>
        <p>
          If you believe material was removed in error, send a counter-notice to the same address
          with the removed URL, your contact details, and the basis for your objection.
        </p>
      </section>

      <section>
        <h2>What happens next</h2>
        <p>
          We review notices, may temporarily remove or annotate disputed material while we assess
          it, and will keep a record of the decision for operational and legal compliance.
        </p>
      </section>
    </article>
  );
}
