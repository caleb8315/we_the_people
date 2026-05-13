import { siteConfig } from '@/lib/site-config';

export const metadata = {
  title: 'Privacy · Crosscheck',
  description: 'How Crosscheck handles account data, processors, retention, exports, and deletion.',
};

const processors = [
  ['Supabase', 'Authentication, Postgres storage, row-level security'],
  ['Cloudflare / hosting CDN', 'Site delivery, TLS, and basic edge protections'],
  ['In-app notifications', 'Delivery of daily briefings and priority alerts inside your account'],
  ['Gemini / Groq (optional)', 'LLM summarization and analyst responses when AI features are used'],
  ['Firecrawl / Brave / Reddit / Bluesky (optional)', 'Live corroboration lookups for verify and develop flows'],
] as const;

const retentionRows = [
  ['Account profile and preferences', 'Until you delete your account'],
  ['Feedback, saved views, AI chats, verifications, product events', 'Until you delete your account'],
  ['Signals, evidence, contradictions, and briefings', 'Public product records retained under product expiry rules'],
  ['In-memory rate-limit buckets', 'Short-lived and automatically reset inside the limiter window'],
] as const;

export default function PrivacyPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-ink-600">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-2 text-ink-600">
          Crosscheck is built to minimize personal data. We keep only the account data needed to run
          your workspace, and we do not use ad trackers or sell personal information.
        </p>
      </header>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Your email address for account authentication.</li>
          <li>Your account profile, preferences, saved views, and feedback.</li>
          <li>Your AI chats, verification submissions, and product events tied to your account.</li>
          <li>Operational request metadata needed for rate limiting and abuse prevention.</li>
        </ul>
      </section>

      <section>
        <h2>What we do not do</h2>
        <ul>
          <li>We do not sell personal data.</li>
          <li>We do not run third-party advertising trackers or pixels.</li>
          <li>We do not require your legal name.</li>
          <li>We do not collect phone numbers or payment details in the beta product.</li>
        </ul>
      </section>

      <section>
        <h2>How we use data</h2>
        <ul>
          <li>Your email authenticates your account.</li>
          <li>Your preferences personalize your feed, briefings, and alerts.</li>
          <li>Your feedback and product events help us improve ranking quality and reduce alert noise.</li>
          <li>Your verification and AI activity is stored so you can revisit prior work.</li>
        </ul>
      </section>

      <section>
        <h2>Processors</h2>
        <ul>
          {processors.map(([name, purpose]) => (
            <li key={name}>
              <strong>{name}.</strong> {purpose}.
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Retention</h2>
        <div className="overflow-x-auto rounded-card border border-ink-100 bg-paper p-4 shadow-card">
          <table className="w-full text-sm">
            <thead className="text-left text-ink-500">
              <tr>
                <th className="pb-2 pr-4 font-medium">Data</th>
                <th className="pb-2 font-medium">Retention</th>
              </tr>
            </thead>
            <tbody>
              {retentionRows.map(([label, retention]) => (
                <tr key={label} className="border-t border-ink-100">
                  <td className="py-2 pr-4 align-top text-ink">{label}</td>
                  <td className="py-2 text-ink-500">{retention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Your controls</h2>
        <ul>
          <li>Export your account data as JSON from Settings using “Export my data.”</li>
          <li>Delete your account from Settings, which removes your auth row and linked user-owned data.</li>
          <li>Manage feed, alert, and notification preferences directly inside Settings.</li>
        </ul>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Privacy questions can be sent to{' '}
          <a href={`mailto:${siteConfig.privacyEmail}`}>{siteConfig.privacyEmail}</a>.
        </p>
      </section>
    </article>
  );
}
