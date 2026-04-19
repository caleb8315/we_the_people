export const metadata = { title: 'Privacy · OSINT Platform' };

export default function PrivacyPage() {
  return (
    <article className="prose-osint max-w-2xl space-y-5 text-white/80">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <h2 className="text-lg font-semibold">What we store</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Your email (used only to send magic-link sign-ins and optional briefing emails).</li>
        <li>Your preferences (topics, muted sources, alert thresholds).</li>
        <li>Your feedback rows on signals / briefings (to improve ranking).</li>
      </ul>
      <h2 className="text-lg font-semibold">What we never do</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>We do not sell or share your data.</li>
        <li>We do not embed third-party trackers or analytics scripts.</li>
        <li>We do not require your real name.</li>
      </ul>
      <h2 className="text-lg font-semibold">Controls</h2>
      <p>
        You can delete your account and all associated rows at any time from Settings. Signals,
        evidence, and briefings are public and not tied to individual users.
      </p>
    </article>
  );
}
