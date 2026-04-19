# Changelog

User-facing changes to the beta. Update as new cohorts get features.

## Unreleased

- Shipped research-driven personalization defaults: My Feed by default with one-tap Global Feed, and dual-mode briefings (`My briefing` + `Global briefing`).
- Added preference controls for feed mode, briefing frequency, alert intensity, and max alerts/day.
- Added low-noise alert behavior (`critical_only` defaults, per-user alert cap preference, telemetry for sent/muted alerts).
- Added minimal product event telemetry (`product_events`) for feed mode adoption, briefing engagement, alert fatigue, and preference changes.
- Added 14-day decision runbook with SQL readouts and guardrails for tuning defaults.
- Switched authentication to simple email/password login + signup for MVP (no SMTP dependency).
- Added per-user AI state tables (`ai_profiles`, `ai_sessions`, `ai_messages`) with strict RLS isolation.
- Initial private beta scaffold: ingest + verify + brief + alert loops.
- Transparent evidence view on each signal page.
- Source toggles + topic muting in Settings.
- Ops dashboard at `/ops` (admin only).
