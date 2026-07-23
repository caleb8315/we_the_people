# Security & Privacy Baseline

This document describes the security posture of the OSINT Platform beta. It is the authoritative reference for reviewers, grant applications, and the launch checklist.

## Threat model (beta scope)

The platform is anonymous-read by default. Only preferences, feedback, and profile rows are tied to authenticated users. We treat the following as in-scope for v1:

- Unauthorized reads of user preferences or feedback rows.
- Abuse of write endpoints (feedback, preferences) to spam or harass.
- Credential theft (password reuse, phishing, token reuse).
- Service-role key exposure.
- AI-provider quota exhaustion / cost attacks.

Explicitly out of scope for v1 (but tracked):

- Full DDoS mitigation (relying on Vercel/Cloudflare defaults).
- Full moderation tooling for user-generated content (UGC disabled in v1).
- Advanced abuse detection (IP rotation / fingerprint analysis).

## Controls

### Data model

- Supabase `auth` manages all user identity.
- All user-facing tables have `enable row level security`.
- Policies restrict `profiles`, `preferences`, `feedback` to the owning `auth.uid()`.
- `signals`, `evidence`, `briefings` are public-read but filter out `quarantined` / `blocked` rows via a view (`signals_public`).
- `usage_ledger` and `engine_runs` are service-role only (default-deny). Public
  operations pages use a separate sanitized `engine_runs_public` view.

### Auth

- Email/password auth for the open beta, backed by Supabase Auth.
- Sign-up is open. Supabase Auth's production rate limits and CAPTCHA should be
  enabled in the Supabase dashboard before launch.
- Session cookie refreshed in middleware on every request.

### API

- Sensitive `/api/*` routes enforce per-IP sliding-window rate limits (see `lib/rate-limit.ts`) and session checks where user context is required.
- Costly verification and image-forensics requests require an authenticated
  session; configure Upstash Redis for production multi-instance rate limiting.
- Write endpoints validate the full body with `zod`.
- Protected endpoints require a valid Supabase session via the SSR client.
- Service-role client is **never** imported from a client component.

### Transport

- HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, strict Referrer-Policy, and a CSP that forbids cross-origin frames and restricts script/style/connect sources.

### Secrets

- `SUPABASE_SERVICE_ROLE_KEY` and LLM keys are server-only environment variables.
- Rotation runbook: see [docs/runbooks.md](runbooks.md).

### Data retention

- Signals auto-expire based on their reliability label and severity (see `computeExpiry`).
- Quarantined / flagged rows expire in ≤ 24h unless promoted.
- Users can export their account data from Settings (`/api/account/export`) and delete their account (`/api/account/delete`), which cascades to profile, preferences, feedback, saved views, and AI state.
- `usage_ledger` rows older than 60 days should be pruned by a scheduled maintenance job.

## Incident response

- All server errors are surfaced to Vercel logs; write-path errors also land in `engine_runs.errors`.
- On credential compromise: rotate the Supabase service-role key and any LLM keys, invalidate sessions via Supabase `admin.auth.signOut`, and re-deploy.
- On data exposure: file an issue with severity label, rotate keys, and notify affected users within 72 hours if PII is involved.

## Legal / positioning

- Platform outputs are described as "evidence-backed source-disagreement signals," not verdicts, not accusations, and not findings of fact.
- We never claim to verify truth or to fact-check individual statements. Reliability labels (Corroborated / Developing / Single-source / Flagged) describe how well a signal is corroborated across independent credible sources. Confidence bands describe how much evidence we have seen. Neither is a claim about what is factually true.
- We only use public data or explicitly licensed feeds.
- Every signal shows source citations, a reliability label, and a confidence band.
