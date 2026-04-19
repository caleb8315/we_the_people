# Privacy policy (plain-English draft)

This mirrors the in-app `/privacy` page. Update both in sync.

## What we collect

- **Email address** — only to send magic-link sign-in emails and optional briefing emails.
- **Preferences** — topics, muted sources, alert threshold.
- **Feedback** — tags you attach to signals/briefings (useful/noise/wrong/helpful_context).

## What we do not collect

- No real names, addresses, phone numbers, or payment info (beta is free).
- No IP address logs beyond ephemeral rate-limit buckets.
- No third-party analytics, ad trackers, or fingerprinting scripts.

## How we use data

- Your email is used only for authentication + optional briefing delivery.
- Preferences are used only to personalize *your* feed and alerts.
- Feedback is aggregated into anonymous scoring weights that improve ranking for all users.

## Sharing

- We never sell data.
- We never share identifiable data with third parties.
- Service providers (Supabase, Vercel, email relay) receive only the minimum data required to provide the service.

## Retention

- User rows (`profiles`, `preferences`, `feedback`) are retained until you delete your account.
- Signals/briefings are public and auto-expire by severity.
- Rate-limit buckets live in-memory and reset within one minute.

## Your rights

- Export: email us (contact in the footer) to receive your account data as JSON.
- Deletion: click "Delete account" in Settings. Your auth row and all linked rows are removed within minutes.
- Access: all your account data is visible in Settings.

## Contact

`privacy@` (domain to be configured at launch).
