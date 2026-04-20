export const metadata = { title: 'Privacy · Crosscheck' };

export default function PrivacyPage() {
  return (
    <article className="prose-osint max-w-3xl space-y-6 text-white/80">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      </header>

      <section>
        <h2>What we store</h2>
        <ul>
          <li>Your email (used only for sign-in and optional briefing emails).</li>
          <li>Your preferences (topics, muted sources, alert thresholds).</li>
          <li>Your feedback rows on signals / briefings (to improve ranking).</li>
        </ul>
      </section>

      <section>
        <h2>What we never do</h2>
        <ul>
          <li>We do not sell or share your data.</li>
          <li>We do not embed third-party trackers or analytics scripts.</li>
          <li>We do not require your real name.</li>
        </ul>
      </section>

      <section>
        <h2>Controls</h2>
        <p>
          You can delete your account and all associated rows at any time from Settings. Signals, evidence, and
          briefings are public and not tied to individual users.
        </p>
      </section>
    </article>
  );
}
