# OSINT Platform

Transparent, privacy-first open-source intelligence platform.

A free-to-run beta build that aggregates public data, verifies events against multiple sources, and surfaces inconsistencies with neutral wording. Designed for 200 beta users on free tiers.

## Monorepo Layout

```
osint-platform/
├── apps/
│   ├── web/              Next.js (Vercel) dashboard + API
│   └── worker/           Node ingest + briefing worker (GitHub Actions)
├── packages/
│   └── core/             Shared types, verification, contradictions, scoring
├── supabase/
│   └── migrations/       Database schema with RLS
├── .github/workflows/    Scheduled ingestion + briefing jobs
├── docs/                 Architecture, security, privacy, runbooks
└── scripts/              Local dev helpers
```

## Stack (all free-tier capable)

- **Next.js 14** on Vercel Hobby (web + API)
- **Supabase** Postgres + Auth + Storage (anon + service role)
- **GitHub Actions** for cron ingestion and briefings
- **Gemini / Groq** for LLM enrichment (daily hard caps)
- **Resend** optional for email briefings (optional Telegram operator channel)

## Quick Start

See [docs/setup.md](docs/setup.md) for full setup and [docs/architecture.md](docs/architecture.md) for system design.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# fill in SUPABASE + at least one LLM key

# 3. Apply database schema
# Paste supabase/migrations/*.sql into the Supabase SQL editor in order

# 4. Run the dashboard
npm run dev

# 5. Run ingestion locally (one cycle)
npm run ingest
```

## Scope (v1 MVP)

- Event feed with source citations and confidence labels
- Daily briefing (in-app + optional email)
- Priority alerts with user-configurable topics
- Source toggles and topic filters
- Contradiction / inconsistency indicators with evidence trails

## Legal / Safety Positioning

This platform surfaces **evidence-backed inconsistencies** between public reports and public data. It does not make accusations, does not use classified sources, and presents confidence and sources for every signal.
