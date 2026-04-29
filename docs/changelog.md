# Changelog

User-facing changes to the beta. Update as new cohorts get features.

## Unreleased

- Built phases 1–4 of the AI trust platform plan ([docs/ai-trust-platform-plan.md](ai-trust-platform-plan.md)):
  - **Phase 1 — shared AI provider.** Web routes (`/api/ai/chat`, `/api/briefings/generate`) and the worker briefing job now share a single Gemini → Groq abstraction in `@osint/core/ai-provider` with consistent timeouts, structured attempt traces, and fail-closed behaviour.
  - **Phase 2 — plain-language trust explanations.** New `@osint/core/trust-explainer` module composes the existing `ConfidenceReport` into a one-sentence summary, "why we say this" bullets, an optional "watch for" hint, and a row of "Learn more" links pointing back to the evidence list, source-disagreement section, physical evidence record, and `/trust`. Tests assert that user-facing trust copy never contains absolute-truth phrasing ("verified facts", "fact-checked", "debunked", "this is true/false", "AI verified", "this is propaganda", "this side is lying", "confirmed motive").
  - Wired the explainer onto every signal detail page as a "What this means" card with anchor-aware deep links into the page sections.
  - **Phase 3 — dispute reading guide.** Deterministic, contradiction-type-aware reading guide on the source-disagreement section that tells readers how to inspect a dispute without picking a winner.
  - **Phase 4 — structured briefings.** Worker briefing prompt and on-demand `/api/briefings/generate` prompt now require five fixed sections — "What happened", "What is widely supported", "What is disputed or unclear", "What changed", "What to watch next" — with an explicit forbidden-phrasing list.
  - **Capability 12 — AI transparency.** `/trust` now has an "Where AI is and is not used" section spelling out which surfaces are deterministic, which use LLMs, and what AI is never allowed to do (write reliability labels, declare facts, accuse anyone, frame sensor absence as denial).
  - Tightened the default AI analyst system prompt for citation-first answers and an explicit "what is supported / disputed / changed / watch" structure.
- Hardened beta access and auth flows: sanitized `next` redirects, enforced the beta allowlist on signup/signin, and added access-request forms on the landing and login pages.
- Added self-serve account export (`/api/account/export`) plus Settings UI to download account JSON directly.
- Shipped the production trust surface: `/terms`, `/contact`, `/dmca`, `/corrections`, `/status`, `/sources`, `/sources-licensing`, `/reliability`, `/changelog`, and `/.well-known/security.txt`.
- Replaced the static status page with live public operational summaries and added a public reliability page backed by `engine_runs` and `source_health_current`.
- Added app-level error boundaries (`app/error.tsx`, `app/global-error.tsx`) for branded recovery instead of generic framework failures.
- Secured worker-driven story enrichment with `WORKER_SHARED_SECRET` and added a nightly maintenance workflow for retention cleanup.
- Consolidated duplicated source grouping, product event names, and daily-limit helpers into `packages/core`, and aligned the schema via `026_product_events_and_retention.sql`.
- Expanded CI to run `npm run typecheck`, `npm run lint`, and `npm run test` on push/PR.
- Reframed product language: the platform describes **reliability**, **corroboration**, **confidence**, and **disagreement** between sources instead of "truth", "verification", or "fact-checking". Badges and copy now show "Corroborated / Developing / Single-source / Flagged" and "Sources disagree". Internal DB enum values are unchanged (no migration).
- Rewrote the default AI analyst system prompt and all briefing/alert prompts to forbid "verified facts" / "fact-check" language and to emphasize source-disagreement callouts.
- Added map/list UX for Feed and Intel workspace, including geospatial signal plotting with exact-vs-approximate location indicators.
- Added mobile-first navigation and denser mobile signal cards for faster one-hand triage.
- Added saved view presets (`user_saved_views`) for feed and intel contexts, with server-side API support.
- Added UX telemetry events and operator validation tiles for map adoption, map-to-signal engagement, mobile usage, and saved-view adoption.
- Shipped research-driven personalization defaults: My Feed by default with one-tap Global Feed, and dual-mode briefings (`My briefing` + `Global briefing`).
- Added preference controls for feed mode, briefing frequency, alert intensity, and max alerts/day.
- Added low-noise alert behavior (`critical_only` defaults, per-user alert cap preference, telemetry for sent/muted alerts).
- Added minimal product event telemetry (`product_events`) for feed mode adoption, briefing engagement, alert fatigue, and preference changes.
- Added 14-day decision runbook with SQL readouts and guardrails for tuning defaults.
- Switched authentication to simple email/password login + signup for MVP (no SMTP dependency).
- Added per-user AI state tables (`ai_profiles`, `ai_sessions`, `ai_messages`) with strict RLS isolation.
- Initial private beta scaffold: ingest + corroborate + brief + alert loops.
- Transparent evidence view on each signal page.
- Source toggles + topic muting in Settings.
- Ops dashboard at `/ops` (admin only).
