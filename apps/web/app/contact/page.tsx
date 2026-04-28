import { siteConfig } from '@/lib/site-config';

export const metadata = {
  title: 'Contact · Crosscheck',
  description: 'Contact Crosscheck for support, privacy requests, security reports, and beta access questions.',
};

export default function ContactPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-ink-600">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Contact</h1>
        <p className="mt-2 text-ink-600">
          Need help with your account, want beta access, or need to report an issue? Use the address
          that best matches your request below.
        </p>
      </header>

      <section>
        <h2>General support</h2>
        <p>
          Email <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a> for product
          questions, tester onboarding, or help using the feed, briefings, and settings.
        </p>
      </section>

      <section>
        <h2>Privacy requests</h2>
        <p>
          Email <a href={`mailto:${siteConfig.privacyEmail}`}>{siteConfig.privacyEmail}</a> for privacy
          questions, account export/deletion follow-up, or questions about retention and processors.
        </p>
      </section>

      <section>
        <h2>Security reports</h2>
        <p>
          Email <a href={`mailto:${siteConfig.securityEmail}`}>{siteConfig.securityEmail}</a> for suspected
          vulnerabilities. For disclosure expectations, see the security policy and security.txt entry.
        </p>
      </section>

      <section>
        <h2>Legal notices</h2>
        <p>
          Send legal notices or takedown/corrections correspondence to{' '}
          <a href={`mailto:${siteConfig.legalEmail}`}>{siteConfig.legalEmail}</a>.
        </p>
      </section>
    </article>
  );
}
