# Privacy policy (plain-English draft)

This mirrors the in-app `/privacy` page. Update both in sync.

## What we collect

- **Account data** — your email address and any optional display name you add.
- **Preferences** — topics, muted sources, alert thresholds, briefing cadence, and saved views.
- **Feedback and verification submissions** — feedback tags on signals/briefings plus optional verification requests you submit.
- **AI workspace state** — your saved AI profile, chat sessions, and chat messages.
- **Minimal product telemetry** — first-party `product_events` rows that measure feature usage inside Crosscheck.

## What we do not collect

- No payment information (beta is free).
- No third-party ad trackers, fingerprinting scripts, or embedded analytics pixels.
- No requirement to use your real name.

## How we use data

- Your email is used for authentication and, if enabled, briefing delivery.
- Preferences personalize *your* feed, briefings, and alert behavior.
- Feedback and telemetry help us tune ranking, onboarding, and low-noise defaults.
- Verification submissions are stored so you can revisit your results.

## Sharing and processors

- We never sell personal data.
- We never share identifiable data except with processors needed to run the service.
- Current processors include **Supabase** (database/auth), **Cloudflare/Vercel** (hosting and edge delivery), and optional service integrations such as **Resend/Brevo**, **Gemini**, **Groq**, **Firecrawl**, and **Brave** when those features are enabled.

## Retention

- User-owned rows are retained until you delete your account.
- Account exports are self-serve through `/api/account/export`.
- Account deletion is self-serve from Settings and removes linked user-owned rows through auth/database cascades.
- Signals and briefings are public product data and follow platform retention/expiry rules rather than account deletion.
- Rate-limit buckets are in-memory and short-lived.
- `usage_ledger` rows older than 60 days are intended to be pruned by scheduled maintenance.

## Your rights

- **Export** — signed-in users can download a JSON export from Settings.
- **Deletion** — signed-in users can delete their account from Settings.
- **Access** — your current profile and preference state is visible in-app.

## Contact

- Privacy requests: `privacy@crosscheck.news`
- Support: `hello@crosscheck.news`
