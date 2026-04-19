# Changelog

User-facing changes to the beta. Update as new cohorts get features.

## Unreleased

- Switched authentication to simple email/password login + signup for MVP (no SMTP dependency).
- Added per-user AI state tables (`ai_profiles`, `ai_sessions`, `ai_messages`) with strict RLS isolation.
- Initial private beta scaffold: ingest + verify + brief + alert loops.
- Transparent evidence view on each signal page.
- Source toggles + topic muting in Settings.
- Ops dashboard at `/ops` (admin only).
