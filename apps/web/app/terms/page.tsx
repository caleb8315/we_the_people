import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Terms of service · Crosscheck',
  description:
    'Terms of service for Crosscheck, including acceptable use, age requirement, service disclaimers, and contact information.',
};

export default function TermsPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-ink-600">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Terms of service</h1>
        <p className="mt-2 text-ink-600">
          Crosscheck is an evidence-and-corroboration product for reading public reporting more
          carefully. These terms govern your use of the website, APIs, and related services.
        </p>
      </header>

      <section>
        <h2>1. What the service is</h2>
        <p>
          Crosscheck clusters public reporting and open sensor data by event, then describes how
          sources agree, where they conflict, and where evidence is thin or missing. It is not a
          news outlet, not a legal service, and not an investigative or attribution platform.
        </p>
      </section>

      <section>
        <h2>2. Eligibility</h2>
        <p>
          You must be at least 16 years old to use the service. If you are using Crosscheck on
          behalf of an organization, you confirm that you have authority to bind that organization
          to these terms.
        </p>
      </section>

      <section>
        <h2>3. Acceptable use</h2>
        <ul>
          <li>Use the service only for lawful purposes.</li>
          <li>Do not attempt to scrape, overload, reverse engineer, or disrupt the platform.</li>
          <li>Do not use Crosscheck to harass, dox, profile, or target individuals.</li>
          <li>
            Do not present Crosscheck output as a statement of fact, legal advice, or a final
            adjudication of what happened.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Accounts and beta access</h2>
        <p>
          Access may be limited to approved users during beta. You are responsible for maintaining
          the confidentiality of your login credentials and for activity that occurs under your
          account.
        </p>
      </section>

      <section>
        <h2>5. Availability and changes</h2>
        <p>
          We may modify, suspend, or discontinue features at any time, especially during beta while
          we improve reliability and safety. We may also impose reasonable rate limits or usage caps
          to protect service quality for all users.
        </p>
      </section>

      <section>
        <h2>6. Intellectual property and sources</h2>
        <p>
          Crosscheck displays links, citations, and structured summaries derived from public or
          licensed sources. Rights in those underlying sources remain with their respective owners.
          You are responsible for complying with any downstream use restrictions that apply to the
          source material itself.
        </p>
      </section>

      <section>
        <h2>7. Disclaimers</h2>
        <p>
          The service is provided on an “as is” and “as available” basis. Crosscheck does not
          guarantee completeness, accuracy, uptime, or fitness for any particular purpose. Outputs
          are informational descriptions of corroboration patterns, not statements of fact.
        </p>
      </section>

      <section>
        <h2>8. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Crosscheck and its operators will not be liable
          for indirect, incidental, special, consequential, exemplary, or punitive damages, or for
          loss of profits, data, goodwill, or business interruption arising out of your use of the
          service.
        </p>
      </section>

      <section>
        <h2>9. Termination</h2>
        <p>
          We may suspend or terminate access if these terms are violated, if use creates security or
          legal risk, or if we need to protect the service and other users.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          Questions about these terms can be sent to{' '}
          <a href={`mailto:${siteConfig.legalEmail}`}>{siteConfig.legalEmail}</a>.
        </p>
      </section>
    </article>
  );
}
