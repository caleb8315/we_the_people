import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sources and licensing · Crosscheck',
  description:
    'Overview of the public-domain, licensed, and terms-bound sources that power Crosscheck.',
};

export default function SourcesLicensingPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-ink-600">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Sources and licensing</h1>
        <p className="mt-2 text-ink-600">
          Crosscheck works from public reporting, open sensor feeds, and terms-bound public APIs. We
          link back to original reporting and keep source rights with the original publishers.
        </p>
      </header>

      <section>
        <h2>Public-domain and official data</h2>
        <ul>
          <li>USGS earthquake feeds and related official event data.</li>
          <li>NASA EONET and other public environmental or sensor datasets.</li>
          <li>NOAA weather and alert feeds.</li>
          <li>Other government or intergovernmental bulletins where reuse is explicitly allowed.</li>
        </ul>
      </section>

      <section>
        <h2>Publisher reporting and RSS</h2>
        <p>
          Crosscheck stores citations, URLs, structured metadata, and short summaries that help users
          compare how reporting lines up. Full rights in the underlying articles remain with the
          publishers. Users should click through for original context and comply with any publisher
          terms that apply.
        </p>
      </section>

      <section>
        <h2>Social and search systems</h2>
        <p>
          Some corroboration workflows rely on public search or social APIs. Those systems are used
          as read-only research inputs during verification and story development, not as sources of
          exclusive rights for Crosscheck content.
        </p>
      </section>

      <section>
        <h2>Our policy</h2>
        <ul>
          <li>We do not scrape behind paywalls or require users to bypass source restrictions.</li>
          <li>We preserve attribution and link users to the original source whenever possible.</li>
          <li>We review takedown and corrections requests through the public DMCA and corrections pages.</li>
        </ul>
      </section>
    </article>
  );
}
