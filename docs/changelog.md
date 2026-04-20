# Changelog

User-facing changes to the beta. Update as new cohorts get features.

## Unreleased

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
