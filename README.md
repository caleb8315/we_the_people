# Crosscheck

**See where reporting agrees, conflicts, and lacks evidence.**

Crosscheck reads public reporting and open sensor networks — seismic (USGS),
satellite (NASA EONET), weather (NOAA), market, and cyber feeds — clusters
them by event, and shows three things for each:

1. **Agreement** — how many independent credible sources describe the event
   the same way.
2. **Conflicts** — the specific points where sources disagree (numeric,
   cause, or presence), with a one-line summary and both citations.
3. **Evidence gaps** — whether sensor networks confirm, partially support,
   or have not detected physical evidence for the report, with the coverage
   limitations that apply.

Crosscheck is deliberately **not** an OSINT investigation tool and **not**
a news app. It does not tell you what happened. It describes how the
public record about an event is lining up across sources and sensors, so
that readers can look into the parts that don't.

## Monorepo layout

The internal monorepo is still named `osint-platform` for historical
reasons (it predates the product's positioning). All user-visible surfaces
now speak as Crosscheck.

```
osint-platform/
├── apps/
│   ├── web/              Next.js (Vercel) dashboard + API
│   └── worker/           Node ingest + scoring worker (GitHub Actions)
├── packages/
│   └── core/             Shared types, reliability scoring, contradiction
│                         detection, claim normalization, evidence assessment
├── supabase/
│   └── migrations/       Database schema with RLS (013–016 roll out the
│                         reliability / contradictions / label / evidence
│                         contracts)
├── .github/workflows/    Scheduled jobs: ingest, briefing, alert,
│                         email-briefings, develop (story enrichment),
│                         backfill
├── docs/                 Architecture, security, privacy, runbooks,
│                         migration-plan.md
└── scripts/              Local dev helpers
```

## Stack (all free-tier capable)

- **Next.js 14** on Vercel Hobby (web + API)
- **Supabase** Postgres + Auth + Storage (anon + service role)
- **GitHub Actions** for cron ingestion, briefing, backfill
- **Gemini / Groq** for LLM enrichment (daily hard caps, strictly opt-in)
- **Resend** optional for email briefings (optional Telegram operator channel)

## Quick start

See [docs/setup.md](docs/setup.md) for full setup,
[docs/architecture.md](docs/architecture.md) for system design, and
[docs/migration-plan.md](docs/migration-plan.md) for the reliability /
contradictions / evidence rollout procedure.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# fill in SUPABASE + (optionally) one LLM key

# 3. Apply database schema
# Paste supabase/migrations/*.sql into the Supabase SQL editor in order

# 4. Run the dashboard
npm run dev

# 5. Run ingestion locally (one cycle)
npm run ingest

# 6. Backfill recent signals (48h window, dry-run first)
npm run backfill -- 48 --dry-run
```

## What Crosscheck does

- Event feed with source citations, reliability labels, and confidence bands
- Daily personal briefing (in-app + optional email)
- Priority alerts with user-configurable topics
- Source toggles, topic filters, and per-account AI analyst sessions
- Per-signal **source disagreement** breakdowns (numeric / cause / presence)
- Per-signal **physical evidence** record (confirmed / partial / none
  detected) with explicit coverage limitations

## What Crosscheck does not do

- It does not tell you what happened. It describes how public reporting and
  sensor data are shaped around an event.
- It does not accuse. Conflicts are shown with both sides and citations.
- It does not investigate people, geolocate imagery, or produce dossiers.
- It does not use classified sources or paywalled content.
- It never phrases absence of sensor data as a denial that an event
  occurred — "no evidence detected" describes coverage, not facts.
