# Setup

Full steps to stand up a fresh deployment of the OSINT Platform beta. Every
step is free-tier compatible.

## Prerequisites

- Node.js 20+
- A Supabase project (free tier)
- A Vercel account (Hobby tier)
- A GitHub repository (public or private)
- At least one LLM API key — Gemini (AI Studio) or Groq (both free tiers)

Optional: Resend for email briefings, Telegram bot for operator alerts.

## 1. Clone and install

```bash
git clone <your-repo>
cd osint-platform
npm install
```

## 2. Create the Supabase project

1. https://supabase.com → New project.
2. Apply every file in `supabase/migrations/` in numeric order (`001` through latest).
3. Settings → API → copy the Project URL, the **anon** key, and the **service_role** key.
4. Authentication → Providers → Email → keep Email provider enabled.
   For MVP simplicity, disable **Confirm email** in Auth settings so users can sign up and log in immediately.

## 3. Fill the local env

```bash
cp .env.example .env
# edit .env and fill SUPABASE vars + at least one LLM key
```

The worker reads `.env` via `dotenv`. The web app reads env vars at build time (Vercel) or from `.env.local` locally.

Important launch vars now included in `.env.example`:

- `SUPPORT_EMAIL`
- `PRIVACY_EMAIL`
- `SECURITY_EMAIL`
- `LEGAL_EMAIL`
- `WORKER_SHARED_SECRET`

## 4. Run the dashboard locally

```bash
npm run dev
```

Open http://localhost:3000. The feed will be empty until ingestion has run at least once.

## 5. Run one ingestion cycle locally

```bash
npm run ingest
```

After success, `select count(*) from public.signals;` should be > 0.

## 6. Deploy to Vercel

1. Vercel → New Project → import the repo.
2. Root Directory: `apps/web`.
3. Add environment variables (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` (after first deploy, set this to the prod URL)
   - `SUPPORT_EMAIL`
   - `PRIVACY_EMAIL`
   - `SECURITY_EMAIL`
   - `LEGAL_EMAIL`
   - `BETA_ALLOWLIST` (comma-separated emails or domain suffixes like `@example.com`)
   - `WORKER_SHARED_SECRET` (must match the worker env if `develop.yml` is enabled)
4. Deploy.

## 7. Configure GitHub Actions schedulers

Add repo secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` and/or `GROQ_API_KEY`
- `WORKER_SHARED_SECRET` (required for the `develop` workflow)
- Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OPERATOR_CHAT_ID`

Optional repo **variables** for budget tuning:

- `MAX_DAILY_LLM_CALLS`
- `MAX_DAILY_LLM_CALLS_SIGNALS`
- `MAX_DAILY_LLM_CALLS_BRIEFING`
- `MAX_DAILY_LLM_CALLS_CONTRADICTION`

Workflows provided:

- [`.github/workflows/ingest.yml`](../.github/workflows/ingest.yml) — hourly
- [`.github/workflows/briefing.yml`](../.github/workflows/briefing.yml) — daily + weekly
- [`.github/workflows/alerts.yml`](../.github/workflows/alerts.yml) — every 30 minutes
- [`.github/workflows/develop.yml`](../.github/workflows/develop.yml) — scheduled story enrichment
- [`.github/workflows/maintenance.yml`](../.github/workflows/maintenance.yml) — nightly retention cleanup
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — typecheck, lint, and tests on push/PR

Trigger each manually once via Actions → Run workflow to validate credentials.

## 8. First-time beta onboarding

1. Insert a row in `public.beta_allowlist` for each invitee.
2. Send them the Vercel URL and instruct them to visit `/login`.
3. Confirm each sign-up in `auth.users`.
4. Confirm the public trust surface resolves: `/terms`, `/privacy`, `/sources`, `/reliability`, `/status`, and `/.well-known/security.txt`.
