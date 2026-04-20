# Architecture

## System diagram

```
                ┌──────────────────────────┐
                │    GitHub Actions cron   │
                │  (ingest / brief / alert)│
                └─────────────┬────────────┘
                              │ invokes apps/worker
                              ▼
 ┌────────────────────────────────────────────────────────┐
 │                   @osint/worker                         │
 │                                                         │
 │   adapters/  ──▶  dedupe + classify  ──▶ corroborate    │
 │   (RSS, USGS,                             (core)        │
 │    NASA EONET)                                          │
 │        │                                       │        │
 │        ▼                                       ▼        │
 │   signals upsert                        source-disagree │
 │   evidence replace                      (contradictions) │
 └─────────────────────────┬──────────────────────────────┘
                           ▼
                    ┌────────────┐
                    │  Supabase  │
                    │  Postgres  │◀── RLS: anon reads
                    │   + Auth   │     public signals/briefings
                    └─────┬──────┘     user-owned prefs/feedback
                          ▼
               ┌────────────────────┐
               │   apps/web (Next)  │──▶ Vercel Hobby
               │  /feed /signal/:id │
               │  /briefings /api/* │
               └────────────────────┘
```

## Read / write boundaries

- **Worker (service role).** Can insert and update `signals`, `evidence`, `briefings`, `engine_runs`, `usage_ledger`, `contradictions`. Never touches auth tables.
- **Web server routes (SSR).** Use the **session** client for reads/writes that belong to the user (preferences, feedback, account delete). Use the **admin** client only for public-read queries that benefit from service-role bypass (e.g. joined views). Admin client is never returned to the browser.
- **Web browser.** Authenticated calls go through Next.js API routes (no direct Supabase writes from the client). This keeps rate limiting and validation server-side.

## Data lifecycle

1. A source adapter fetches raw items from a public feed.
2. Items are grouped by `dedupe_key` (normalized title + country + day + topic).
3. For each group, heuristic severity + a reliability (corroboration) decision are computed.
4. Signal is upserted. Evidence is replaced.
5. Source-disagreement detector (deterministic) runs per signal; hits are stored in the `contradictions` table.
6. Alerts job picks signals with `severity ≥ 80` that are at least developing in reliability (corroborated or developing).
7. Briefing job assembles top signals once per day into a single `briefings` row, with neutral wording and no findings of fact.

## Budget guarantees

- `@osint/core/budget` wraps every LLM call with a daily ledger insert.
- Global cap (`MAX_DAILY_LLM_CALLS`) + per-bucket caps.
- On ledger failure → skip LLM (fail closed).
- Worker falls back to deterministic briefing text when budget is exhausted.

## Failure modes

- **Single adapter fails.** The ingest job continues with the remaining ones and logs the error in `engine_runs.errors`.
- **Supabase unreachable.** Worker exits 1; cron simply retries on the next schedule.
- **LLM provider down.** Gemini → Groq fallback; then deterministic text.
- **Vercel function cold start.** All API routes are read-light and use `s-maxage` where appropriate.
