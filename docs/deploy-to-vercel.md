# Deploy to Vercel (free tier)

This repo is already configured for Vercel. Follow the steps below to get a
public preview URL you can use for testing.

## Prereqs

- Verified GitHub account (your push to main currently requires email verification).
- Supabase project with the production URL and keys (Project settings -> API).
- Optional: Gemini + Groq API keys, Resend API key + verified sender (or use `onboarding@resend.dev` for testing).

## Step 1: Import the repo

1. Go to https://vercel.com and sign in with GitHub.
2. Add New -> Project -> Import `caleb8315/we_the_people`.
3. Under "Root Directory", set it to `apps/web`.
4. Framework preset: Next.js (auto-detected).
5. Build command / install command: leave blank — `apps/web/vercel.json` already defines them for the monorepo.

## Step 2: Environment variables

Paste these in the Vercel import UI (or in Project -> Settings -> Environment Variables).
Mark each as Production + Preview + Development.

Required:

- `NEXT_PUBLIC_SUPABASE_URL` - from Supabase Project settings (the root URL, no trailing `rest/v1/`).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` - server-only; never expose on client.

Strongly recommended:

- `GEMINI_API_KEY` - from https://aistudio.google.com/apikey.
- `GROQ_API_KEY` - from https://console.groq.com.
- `ADMIN_EMAILS` - comma-separated list including your own email, for `/ops` access.
- `NEXT_PUBLIC_APP_URL` - the Vercel URL (e.g. `https://we-the-people.vercel.app`).

Optional (per-feature):

- `RESEND_API_KEY` and `BRIEFING_FROM_EMAIL` - email briefings and alerts.
  - For testing without a domain: use `onboarding@resend.dev`.
- `USER_DAILY_CHAT_LIMIT` = 10
- `USER_DAILY_PRIORITY_ALERT_LIMIT` = 5
- `USER_DAILY_BRIEFING_EMAIL_LIMIT` = 1
- `USER_DAILY_BRIEFING_CALL_LIMIT` = 2
- `MAX_DAILY_LLM_CALLS*` - LLM budget caps.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_OPERATOR_CHAT_ID` - operator alert channel.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` - optional Redis rate limiting.
- `WORKER_SHARED_SECRET` - signed secret if you trigger callbacks from workers.

## Step 3: Deploy

Click Deploy. The first build takes ~1-2 minutes. You will get a URL like
`https://we-the-people-<hash>.vercel.app`.

## Step 4: Wire Supabase redirect URLs

In Supabase -> Authentication -> URL Configuration, add:

- Site URL: your Vercel production URL.
- Redirect URLs: `https://*.vercel.app` (covers preview deploys) and your custom domain if you add one later.

## Step 5: Run migrations on the Supabase project

Make sure these migrations from `supabase/migrations/` have been applied in order in the Supabase SQL Editor:

- `001_init.sql`
- `002_seed_sources.sql`
- `003_access_requests.sql`
- `004_user_ai_state.sql`
- `005_user_onboarding.sql`
- `006_user_delivery_and_location.sql`
- `007_ai_journalist_defaults.sql`
- `008_user_daily_limits.sql`
- `009_research_preferences_and_events.sql`
- `010_dashboard_last_visit.sql`

## Step 6: Configure GitHub Actions workers

In GitHub -> Settings -> Secrets and variables -> Actions, add:

- `SUPABASE_URL` (same value as `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `RESEND_API_KEY`
- `BRIEFING_FROM_EMAIL`
- `USER_DAILY_*` vars
- Any other values you set in Vercel.

The workflows under `.github/workflows/` will then run on schedule:

- `ingest.yml` hourly
- `briefing.yml` daily + weekly
- `alerts.yml` every 30 min
- `email-briefings.yml` daily

## Preview deploys (testing while at work)

Every branch push to GitHub creates a unique Vercel preview URL. You can work
on a feature branch and share the preview without touching production.

```bash
git checkout -b feature/my-change
# ...edits...
git push origin feature/my-change
# Vercel posts a preview URL to the PR / commit.
```

## Quick sanity checklist after first deploy

1. Open the Vercel URL -> landing page loads.
2. `/feed` loads anonymously and shows global signals only (no `My feed` toggle).
3. Sign up a new account -> lands in onboarding -> dashboard.
4. Dashboard shows the at-a-glance strip with real numbers.
5. Settings -> change feed mode default, save -> `Saved.` appears.
6. `/ops` redirects to login if your email is not in `ADMIN_EMAILS`.

## Troubleshooting

- Blank page / 500: check Vercel deployment logs (Project -> Deployments -> click latest -> "Runtime Logs").
- `Your project's URL and Key are required`: `NEXT_PUBLIC_SUPABASE_URL` or anon key missing in Vercel env.
- `invalid server env`: server env variable missing (check Vercel Production + Preview scopes).
- "row-level security policy" errors: migration `009`/`010` not yet applied.
