# Deploy to Vercel (free tier)

This repo is already configured for Vercel. Follow the steps below to get a
public preview URL you can use for testing.

## Prereqs

- A GitHub account linked to you (GitHub may require email confirmation before it lets you push to `main`). This is GitHub's own account check, unrelated to how the OSINT Platform scores reliability.
- Supabase project with the production URL and keys (Project settings -> API).
- Optional: Gemini + Groq API keys and a Telegram bot/channel for operator alerts.

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

- `USER_DAILY_CHAT_LIMIT` = 10
- `USER_DAILY_PRIORITY_ALERT_LIMIT` = 5
- `USER_DAILY_BRIEFING_NOTIFICATION_LIMIT` = 1
- `USER_DAILY_BRIEFING_CALL_LIMIT` = 2
- `MAX_DAILY_LLM_CALLS*` - LLM budget caps.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_OPERATOR_CHAT_ID` - operator alert channel.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` - required for
  multi-instance production rate limiting.
- `WORKER_SHARED_SECRET` - required if you run the `develop` worker against `/api/signal/:id/develop`.
- `SUPPORT_EMAIL`, `PRIVACY_EMAIL`, `SECURITY_EMAIL`, `LEGAL_EMAIL` - public trust/contact addresses.

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
- `011_expand_source_catalog.sql`
- `012_ux_map_mobile_research.sql`
- `013_reframe_ai_defaults.sql`
- `014_contradictions_contract.sql`
- `015_reliability_dimensions.sql`
- `016_reliability_labels.sql`

Apply every migration through the latest file in `supabase/migrations/`,
including:

- `018_verifications_and_source_health.sql`
- `019_image_observations.sql`
- `020_phase4_social_sources.sql`
- `021_phase5_kpi_views.sql`
- `022_signal_enrichment.sql`
- `023_update_signals_public_view.sql`
- `024_tech_finance_sources.sql`
- `025_google_news_and_coverage_expansion.sql`
- `026_product_events_and_retention.sql`
- `027_user_notifications.sql`
- `028_verification_case_files.sql`
- `029_update_ai_prompt_defaults_decisive_style.sql`
- `030_operator_alerts.sql`
- `031_user_progress.sql`
- `032_public_ops_snapshot.sql`

For the reliability / contradictions / evidence rollout — including the
backfill procedure that populates the new columns on recently-ingested
signals without recomputing full history — see
[docs/migration-plan.md](migration-plan.md).

## Step 6: Configure GitHub Actions workers

In GitHub -> Settings -> Secrets and variables -> Actions, add:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `WORKER_SHARED_SECRET`
- `USER_DAILY_*` vars
- Any other values you set in Vercel.

The workflows under `.github/workflows/` will then run on schedule:

- `ingest.yml` every 15 minutes
- `briefing.yml` daily + weekly
- `alerts.yml` every 30 min
- `email-briefings.yml` daily (writes in-app daily notifications)
- `develop.yml` every 2 hours
- `maintenance.yml` nightly

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
6. Settings -> `Export my data` downloads JSON.
7. `/sources`, `/reliability`, `/status`, and `/changelog` load publicly.
8. `/ops` redirects to login if your email is not in `ADMIN_EMAILS`.

## Troubleshooting

- Blank page / 500: check Vercel deployment logs (Project -> Deployments -> click latest -> "Runtime Logs").
- `Your project's URL and Key are required`: `NEXT_PUBLIC_SUPABASE_URL` or anon key missing in Vercel env.
- `invalid server env`: server env variable missing (check Vercel Production + Preview scopes).
- "row-level security policy" errors: migration `009`/`010` not yet applied.
