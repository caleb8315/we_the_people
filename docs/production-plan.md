# Production & Launch Plan — 100% Free Tier Edition

A full plan to take Crosscheck from "private beta scaffold" to public, grant-ready product, while staying at **$0/month** through at least 200 users. No workarounds, no trial-ware, no "free for 30 days" rugs. Alternatives are listed for each layer so nothing is a single point of failure.

This plan sits alongside, and does not replace, [launch-plan.md](launch-plan.md) (cohort gates), [security.md](security.md), [privacy.md](privacy.md), and [metrics.md](metrics.md).

---

## 0. Where we are today

What already exists in the repo (don't redo):

- Next.js 14 web app (`apps/web`) with Supabase SSR auth, middleware CSP, rate limiting (`lib/rate-limit.ts`), RLS on user tables, magic-link / email-password auth.
- Worker (`apps/worker`) with ingest, brief, alert, email-briefings, backfill, develop (story enrichment) jobs, driven by GitHub Actions cron.
- Core package (`packages/core`) with reliability scoring, contradictions, evidence, confidence bands, clustering, domains, media.
- Supabase schema (`supabase/migrations/001` through `023`) with `signals`, `evidence`, `briefings`, `contradictions`, `engine_runs`, `usage_ledger`, `beta_allowlist`, `product_events`, `user_saved_views`, `user_ai_state`.
- Daily LLM budget guards (`MAX_DAILY_LLM_CALLS*`) and per-user daily limits (`USER_DAILY_*`).
- Docs: `architecture.md`, `security.md`, `privacy.md`, `runbooks.md`, `metrics.md`, `launch-plan.md`, `migration-plan.md`, `changelog.md`, `deploy-to-vercel.md`.
- `/ops` admin dashboard, `/trust`, `/about`, `/privacy` static pages, `/onboarding`, `/settings`, `/dashboard`, `/feed`, `/signal/[id]`, `/briefings`, `/verify`.

What's missing is the "last-mile production polish" — legal pages, trust surface, observability, monetization hooks, and the hosting migration that lets us stay free even once money shows up.

---

## 1. Guiding principles

1. **Free forever for readers.** The civic core (feed, briefings, conflict detection, evidence panels) is never gated.
2. **Privacy posture is the moat.** No ad trackers, no third-party analytics that set cookies, no data resale. This is both principled and grant-fundable.
3. **Methodology is public.** Open code + open methodology page + public source catalog + public reliability chart.
4. **Every dependency has a pre-picked alternative.** If a free tier changes, we already know the swap.
5. **No commercial-use traps.** Every service we run in production must allow commercial use on its free plan. This rules out Vercel Hobby the moment we accept a dollar.
6. **Defer billing complexity.** Ship GitHub Sponsors + a Stripe Payment Link first. Only build a real subscriptions table when there are >50 WAU.

---

## 2. Target stack (free tier, commercial-use allowed)


| Layer                                 | Primary                                        | Fallback                                             | Notes                                                                        |
| ------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Hosting (Next.js)**                 | Cloudflare Pages (`@cloudflare/next-on-pages`) | Netlify Starter                                      | Unlimited bandwidth, commercial use allowed, edge runtime.                   |
| **DB + Auth**                         | Supabase Free                                  | Neon + Lucia/Clerk Free                              | 500 MB DB, 50k MAU, Auth included. Cron prevents the 7-day inactivity pause. |
| **Cron / workers**                    | GitHub Actions (public repo)                   | Cloudflare Workers Cron + Upstash QStash             | Public repo = unlimited minutes.                                             |
| **Email**                             | Brevo (300/day free forever)                   | Amazon SES (~$0.10 per 1k — cheapest paid long-term) | Resend's 100/day is the wall; Brevo triples it.                              |
| **DNS / CDN / WAF / basic analytics** | Cloudflare Free                                | —                                                    | Always in front of the site.                                                 |
| **Error tracking**                    | Sentry Free (5k events/mo)                     | GlitchTip self-hosted on Oracle Free VM              |                                                                              |
| **Rate limit / Redis**                | Upstash Redis Free                             | In-memory fallback already coded                     | Already wired.                                                               |
| **Object storage**                    | Cloudflare R2 (10 GB + zero egress)            | Supabase Storage (1 GB)                              | Only needed when we start caching screenshots/exports.                       |
| **Uptime**                            | Better Stack Free                              | UptimeRobot Free                                     | 10-min pings on `/`, `/feed`, `/api/signals`.                                |
| **Status page**                       | Better Stack Status (free)                     | Plain `/status` route                                | Public status is grant-credibility.                                          |
| **Product analytics**                 | In-app `product_events` (current)              | Plausible self-hosted on Oracle Free                 | Keeps the "no third-party analytics" promise honest.                         |
| **Domain registrar**                  | Cloudflare Registrar (at-cost)                 | Porkbun                                              | At-cost means ~$10/yr, no markup.                                            |
| **Repo / CI**                         | GitHub (public)                                | —                                                    |                                                                              |
| **LLMs**                              | Gemini Free + Groq Free                        | Cerebras Cloud Free                                  | Already guarded by daily budget ledger.                                      |
| **Web search**                        | Firecrawl Free (500/mo) + Brave (2k/mo)        | DuckDuckGo scraping                                  | Already wired.                                                               |
| **Donations / early monetization**    | GitHub Sponsors + Stripe Payment Link          | Buy Me a Coffee / Open Collective                    | Zero integration work. Real billing comes later.                             |


**When to break the $0 rule (in order of actual ROI):**

1. Supabase Pro — $25/mo (backups, no pausing, 8 GB DB). First.
2. Custom domain — ~$10/yr. Effectively free but not $0.
3. Brevo paid — only if we blow past 300/day. Not before ~200 DAU with daily emails.
4. Amazon SES — once email cost beats Brevo paid.
5. Vercel Pro — don't. Cloudflare Pages replaces it for free.

---

## 3. Phased plan

### Phase 0 — foundations (Week 0, before any public signup)

The hard blockers. A public reviewer or grant committee checks for these within the first minute on the site.

Legal / compliance:

- **Terms of Service page** at `/terms`. Acceptable use, disclaimer of warranty, limitation of liability, governing law, "not legal advice / not a news outlet" clause matching the `README.md` positioning.
- **Privacy policy hardening** — `/privacy` page needs a real contact email (replace `privacy@`), list of named processors (Supabase, Cloudflare, Brevo, Gemini, Groq, Firecrawl, Brave, Reddit, Bluesky, Sentry), and a clear data-retention table.
- **DMCA / takedown policy** at `/dmca` with a designated agent email.
- **Corrections policy** at `/corrections` (SLA for review, how retracted signals get annotated).
- **Cookie notice** — a minimal "essential cookies only" banner. Since we set only auth cookies, one dismissible banner is compliant.
- **Age gate statement** in ToS — pick "13+" (COPPA) or "16+" (EU-safe). Recommend 16+.
- **security.txt** served at `/.well-known/security.txt` with reports email + disclosure policy.
- **Source licensing / attribution page** at `/sources-licensing` (distinct from the live source catalog in Phase 1). Covers USGS/NASA/NOAA public domain, and our read-only terms for Reddit/Bluesky/RSS.
- **Refunds / cancellation policy** stub page — needed once Stripe turns on, link it preemptively from ToS.

Product polish:

- **Buy custom domain** via Cloudflare Registrar (at-cost).
- **Favicon, OG image, Apple touch icons** in `apps/web/public/`.
- **Site-wide SEO metadata** — real `<title>`, meta description, canonical, Open Graph, Twitter card on every public route.
- **Sitemap + robots.txt** dynamic routes.
- **JSON-LD** (`NewsArticle` / `ItemList`) on `/signal/[id]` and `/feed`.
- **Error boundaries** in each route group (currently only global `not-found.tsx`).
- **Accessibility pass** — keyboard nav, focus rings, contrast (WCAG AA), alt text on map markers and any signal imagery.
- **Mobile QA** on real devices (iOS Safari + Android Chrome) for feed, signal detail, map, onboarding, settings, briefings.
- **First-run empty states** for `/feed` (no signals yet) and `/briefings` (no briefing yet).
- **One-screen onboarding tour** explaining Agreement / Conflicts / Evidence gaps.

Repo hygiene:

- **Make the GitHub repo public** (gives unlimited Actions minutes and doubles as a trust signal).
- Add `CODE_OF_CONDUCT.md` (Contributor Covenant).
- Add `SECURITY.md` with how to report vulns (must match `security.txt`).
- Add `ci.yml` workflow running `npm run typecheck`, `npm run lint`, `npm test` on every PR.
- Enable Dependabot (or Renovate) for security and dependency updates.

Exit gate for Phase 0: every link in the footer resolves, repo is public, CI is green on main.

---

### Phase 1 — trust surface (Week 1)

These pages are *specifically* what separates Crosscheck from a generic dashboard and makes grant reviewers stop scrolling. They are the product, not decoration.

- `**/methodology`** — how reliability labels, contradiction detection, evidence scoring, and confidence bands are computed. Link to the relevant files in `packages/core/src/` (`scoring.ts`, `contradictions.ts`, `evidence.ts`, `confidence.ts`). Plain language + technical appendix.
- `**/sources**` — live view of `public.sources` (which feeds are enabled, last fetch time, error rate from `engine_runs`). Builds from data we already have.
- **Public reliability page** (`/reliability` or `/ops-public`) — sanitized version of `/ops`: ingest success rate over 30 days, signals ingested per day, sources currently monitored, last successful run per job. Powered by `engine_runs`.
- `**/changelog`** — render `docs/changelog.md` as a public page with dates.
- `**/how-conflicts-work**` — the differentiator explainer. Screenshot-driven: "here is a real signal with two sources disagreeing on casualty numbers; here's how we surface it."
- `**/about**` — update existing page with mission, non-goals (pulled from `README.md`'s "what Crosscheck does not do"), team (even just founder), and funding model.
- `**/contact**` — single form or email link.
- **Status page** — either self-hosted `/status` driven by `engine_runs` + Supabase health, or a free Better Stack Status page. Publicly visible.

Exit gate for Phase 1: the footer has full coverage (terms, privacy, DMCA, corrections, methodology, sources, sources-licensing, contact, changelog, status, security). A reviewer can click any link and get a real page.

---

### Phase 2 — observability & SRE (Week 1–2)

What we can't see, we can't debug, and grants expect to see uptime numbers.

- **Sentry Free** wired into `apps/web` (browser + server) and `apps/worker`. Alerts to email + Telegram (`TELEGRAM_OPERATOR_CHAT_ID` already in env).
- **Better Stack / UptimeRobot** pinging `/`, `/feed`, `/api/signals` every 10 min from 3 regions.
- **Vercel log retention** is short; port logs to Cloudflare Logpush or Logtail (both free tiers) as part of the Phase 5 migration.
- **Uptime + error webhooks → Telegram operator channel** (already have the credential plumbing).
- `**/ops` polish** — verify every KPI tile renders; add ingest-success-per-day chart if not already there.
- **Prune cron** — nightly job to drop `usage_ledger` rows older than 60 days (per `docs/security.md`) and expired signals beyond `computeExpiry`. Add to `.github/workflows/`.
- **Supabase backup check** — confirm daily backups are on, document restore procedure in `runbooks.md`. (Free tier retains 7 days — noted as an upgrade trigger.)

Exit gate for Phase 2: a P1 error page-loads into Telegram within 2 minutes; uptime page shows 7+ days of green checks.

---

### Phase 3 — data safety & privacy promise follow-through (Week 2)

Every promise in `docs/privacy.md` must map to a real user-facing action.

- `**/api/account/export`** — JSON export of every row tied to `auth.uid()` (profile, preferences, feedback, saved views, AI sessions). Already promised in privacy doc.
- `**/api/account/delete**` — audit the existing route, confirm it cascades to every user-owned table and invalidates sessions.
- **PII audit** — grep every `apps/worker/src/jobs/*` and `apps/web/app/api/`** for places raw emails land in logs, `engine_runs.errors`, or `product_events`. Strip or hash.
- **Log scrubbing** — add a middleware on worker logs that drops request headers with `authorization` / `cookie`.
- **Data retention enforcement** — confirm the prune cron matches retention language in `/privacy`.
- **Data Processing Agreement (DPA) placeholder** — link out to Supabase + Cloudflare DPAs on the privacy page.

Exit gate for Phase 3: a user can sign up, use the app for a week, export their data, and delete their account — end-to-end, in the UI, with everything gone.

---

### Phase 4 — email capacity & low-noise defaults (Week 2)

Keep us inside the free email ceiling even at 200 users.

- **Switch default briefing cadence to weekly** (daily remains opt-in).
- **Hard-cap outbound email at 100/day at the sender layer** (not just the `USER_DAILY_BRIEFING_EMAIL_LIMIT=1` per-user cap).
- **Swap Resend → Brevo** as primary sender; keep Resend credentials as fallback.
- **Confirmed sender domain** via Cloudflare DNS (SPF + DKIM + DMARC).
- **Unsubscribe link + preferences center** on every transactional email (regulatory + sensible).
- **Bounce/complaint handling** — webhook from Brevo that disables email for that user in `profiles`.

Exit gate for Phase 4: 200 mock users get a weekly briefing inside the free ceiling, every email passes SPF/DKIM/DMARC, unsubscribes work.

---

### Phase 5 — hosting migration to Cloudflare Pages (Week 3)

This is the one-afternoon migration that eliminates the Vercel commercial-use trap and gives us unlimited bandwidth for free, forever.

- **Install Cloudflare Pages adapter** — `@cloudflare/next-on-pages`.
- **Audit routes for Node-only APIs.** Middleware (`middleware.ts`) and every `app/api/*/route.ts` must be edge-compatible. Supabase SSR is fine. Any `fs`, Node `crypto`, or Node-only package is flagged and migrated.
- **Port env vars** from Vercel to Cloudflare Pages (Production + Preview scopes).
- **Wire Cloudflare DNS + HTTPS** for the custom domain.
- **Preview-deploy parity check** — every PR still gets a unique URL.
- **Auth redirect URLs updated** in Supabase (add the Cloudflare Pages domain + preview wildcard).
- **Smoke test** `/`, `/feed`, `/signal/[id]`, `/briefings`, `/login`, `/settings`, `/ops`, `/api/*` on production Cloudflare deploy.
- **Update `docs/deploy-to-vercel.md`** → rename to `deploy.md`, document both Cloudflare (primary) and Vercel (fallback). Keep fallback as hedge.

Exit gate for Phase 5: Cloudflare Pages is serving production traffic from the custom domain; `*.vercel.app` is retired or redirects to the new domain.

---

### Phase 6 — monetization ladder (Week 4+)

The lightest touch that keeps the civic core free.

- **GitHub Sponsors button** in repo + footer. Zero integration.
- **Stripe Payment Link** for one-time donations. Zero code. Paste URL into `/about` and footer.
- `**/pricing` page** — "free forever" primary message + optional "Supporter" ($5/mo) framed as "supports the project" not "removes ads" (we never run ads).

Only *after* 50+ WAU and at least a handful of donors:

- **Full Stripe subscription wiring** — migration `024_subscriptions.sql` (new table), `/api/billing/checkout`, `/api/billing/portal`, `/api/billing/webhook` (nodejs runtime, raw body for signature verification).
- **Supporter perks**: higher `USER_DAILY_CHAT_LIMIT`, higher `USER_DAILY_BRIEFING_CALL_LIMIT`, higher "Develop this story" quota, early access to new sources, supporter badge. None of these gate the reading experience.
- **Stripe Tax** enabled (free, removes grant-reviewer objections about US sales tax compliance).
- **Env additions** (`.env.example`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_SUPPORTER_MONTHLY`, `STRIPE_PRICE_SUPPORTER_YEARLY`.
- **Refunds / cancellation page** fleshed out (was a stub in Phase 0).

**Hard "no"s (protect the grant story):**

- No display ads. Ever.
- No selling data. Ever.
- No paywalling reading, feed, briefings, conflict detection, evidence panels, or the methodology page.
- No third-party trackers or pixels.

Exit gate for Phase 6: donations and optional Supporter tier are live; 100% of civic-core features remain free.

---

### Phase 7 — grant-readiness package (Week 4–6, overlaps with cohort 3)

Everything a program officer will ask for, ready to hand over as a PDF + links.

- **One-page "what Crosscheck does / does not do" PDF** pulled from `README.md`.
- **30-day reliability chart** (ingest success per day) generated from `engine_runs`.
- **Weekly user growth + retention chart** from `metrics.md` queries.
- **3–5 written user case studies** — consented quote + permitted screenshot. Journalist, analyst, researcher, NGO worker.
- **Architecture diagram as an image** (the ASCII one in `architecture.md` rendered through Mermaid or similar).
- **Sustainability plan memo** — the ladder in Phase 6 with projected costs at 1k / 10k users.
- **Editorial independence statement** — already partially present in `security.md`, promote to its own page.
- **Legal entity / fiscal sponsor** — LLC, nonprofit, or fiscal sponsorship through Open Collective / Code for America Brigade. Many grants require a named recipient.
- **Named processors list** on `/privacy` matches real use.
- **Public `/ops` reliability page** (from Phase 1) linked in the package.

**Initial grant targets (ordered by best fit):**

1. Knight Foundation — Prototype Fund.
2. Craig Newmark Philanthropies.
3. NewsMatch (operating grants for newsroom-adjacent nonprofits).
4. Mozilla Technology Fund.
5. Digital Public Goods Alliance (if we publish broader open standards).
6. Reporters Committee for Freedom of the Press.
7. Local / state journalism innovation funds (varies by state).

Exit gate for Phase 7: at least one grant submitted with the full package attached.

---

## 4. Free-tier capacity math (at 200 users)

Realistic monthly load, with the target stack:


| Service                      | Free tier ceiling                             | Expected load at 200 users                   | Risk                            | Upgrade trigger                                                |
| ---------------------------- | --------------------------------------------- | -------------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| Cloudflare Pages             | Unlimited bandwidth, 100k Workers reqs/day    | ~20k req/day at 200 DAU                      | None — headroom 5×              | Never (move to Workers Paid $5/mo only at millions of req/day) |
| Supabase Free                | 500 MB DB, 1 GB storage, 50k MAU, 2 GB egress | ~80 MB DB after expiry cron                  | DB growth if expiry cron breaks | 400 MB used → upgrade to Pro ($25/mo)                          |
| GitHub Actions (public repo) | Unlimited                                     | Hourly ingest + daily crons                  | None                            | Never                                                          |
| Brevo                        | 300/day free                                  | 200 weekly briefings ÷ 7 = ~30/day + alerts  | Comfortable                     | >250/day sustained → Brevo Lite ($9/mo) or SES                 |
| Gemini Free                  | ~1,500 req/day                                | `MAX_DAILY_LLM_CALLS=200`                    | None                            | LLM budget increase → raise caps                               |
| Groq Free                    | Generous                                      | Fallback only                                | None                            | —                                                              |
| Firecrawl Free               | 500 pages/mo                                  | Only `/verify` and `develop`, gated per-user | None                            | Heavy "Develop this story" usage                               |
| Brave Search                 | 2k/mo                                         | Secondary web index                          | None                            | —                                                              |
| Upstash Redis                | 10k commands/day                              | Rate limiter only                            | None                            | —                                                              |
| Cloudflare R2                | 10 GB + zero egress                           | Not used until we cache images               | None                            | —                                                              |
| Sentry Free                  | 5k events/mo                                  | Target ≤1k with good hygiene                 | Spike on bad deploy             | >5k → GlitchTip self-hosted                                    |
| Better Stack                 | 10 monitors, 30s checks                       | 3 monitors                                   | None                            | —                                                              |


**Projected total run cost at 200 users, target stack, no upgrades: $0/month.** The only real spend is the domain (~$10/year).

---

## 5. Upgrade ladder (when money arrives)

When grant money or supporter revenue lands, spend it in this order:

1. **Supabase Pro** — $25/mo. Real backups, no inactivity pause, log retention, 8 GB DB.
2. **Brevo Lite → or Amazon SES** — $9/mo or ~$0.10 per 1k. Triggered by sustained >250 emails/day.
3. **Custom email domain with DMARC reject policy** — still free, but a post-migration cleanup task.
4. **Cloudflare Images** — $5/mo, only if we do real image processing.
5. **Sentry Team** — $26/mo, only if event volume genuinely exceeds free tier.

Do **not** pay for: Vercel Pro, Netlify Pro, Fly.io, Render paid, AWS Amplify, PlanetScale, Datadog. Cloudflare Pages + Supabase Pro + SES is the serious-but-cheap endgame.

---

## 6. Non-goals for v1 (stated for honesty)

- No user-generated public content (comments, public posts). UGC is a moderation cost sink; feedback stays private.
- No real-time collaborative editing.
- No paid data feeds.
- No classified or paywalled sources.
- No SMS / phone number collection.
- No auto-translation at launch (post-200 goal).

---

## 7. Operator checklist — day of public launch

Pre-flight, in order:

1. Cloudflare Pages production deploy green; custom domain resolves.
2. Supabase migrations `001` through latest applied on production project.
3. Env vars present in Cloudflare (production + preview) and GitHub Actions secrets.
4. Footer links all resolve; `/terms`, `/privacy`, `/dmca`, `/corrections`, `/methodology`, `/sources`, `/changelog`, `/contact`, `/status`, `/security.txt` all return 200.
5. One end-to-end happy path: signup → magic link or email-password → onboarding → dashboard → feed → signal detail → feedback submit → briefing open → settings change → account export → account delete.
6. Sentry receives a test error from web + worker.
7. Uptime monitor shows 3 consecutive green checks.
8. Telegram operator channel receives a test alert.
9. `/ops` shows real numbers; public reliability page shows the same numbers (sanitized).
10. GitHub Sponsors button + Stripe Payment Link live on `/about` and in the footer.

Then open cohort 1 (20 users) per [launch-plan.md](launch-plan.md). Don't skip cohort gates.

---

## 8. Alternatives, per layer (in case any free tier changes)

- **Hosting:** Cloudflare Pages → Netlify Starter → self-host on Oracle Cloud Always Free (4 ARM cores + 24 GB RAM) behind Cloudflare.
- **DB + Auth:** Supabase → Neon (Postgres) + Clerk Free (auth) or Lucia → self-hosted Supabase on Oracle Free.
- **Email:** Brevo → Mailjet (6k/mo, 200/day) → Amazon SES.
- **Error tracking:** Sentry → GlitchTip self-hosted → Highlight.io.
- **Analytics:** in-app `product_events` → Cloudflare Web Analytics (cookieless) → Plausible self-hosted.
- **Uptime:** Better Stack → UptimeRobot → `cron-job.org` pinger.
- **Cron:** GitHub Actions → Cloudflare Workers Cron → Upstash QStash.
- **Object storage:** Cloudflare R2 → Backblaze B2 → Supabase Storage.
- **Domain registrar:** Cloudflare Registrar → Porkbun → Namecheap.
- **Payments:** GitHub Sponsors + Stripe Payment Link → Open Collective → Buy Me a Coffee. Full Stripe subscriptions only after product-market fit.

Every row has at least one backup. No single vendor change takes us down.

---

## 9. Linkage to existing docs

- **[launch-plan.md](launch-plan.md)** — cohort gates (20 → 75 → 200), weekly rituals, grant-readiness package. This plan feeds into those gates.
- **[security.md](security.md)** — threat model. All new auth, billing, and export endpoints inherit the same rate limiting + RLS.
- **[privacy.md](privacy.md)** — user-facing promise. Phase 3 exists to make every bullet enforceable.
- **[metrics.md](metrics.md)** — KPIs. Phase 2 makes them visible; Phase 7 packages them for grants.
- **[runbooks.md](runbooks.md)** — operator playbooks. Add runbooks for Cloudflare deploy rollback, Brevo bounce handling, Stripe webhook failure, Sentry alert triage.
- **[changelog.md](changelog.md)** — public-facing. Every Phase exit gate should ship with a changelog entry.
- **[migration-plan.md](migration-plan.md)** — existing data migration procedure. Precedent for how we roll out `024_subscriptions.sql` later.

---

## 10. Summary — the one-paragraph pitch

Crosscheck can go to public beta, reach 200 users, and file grant applications **without paying any provider a dollar**, by (1) moving hosting to Cloudflare Pages before we take any money, (2) keeping Supabase Free with a cron-driven keepalive, (3) running crons on a public GitHub repo for unlimited Actions minutes, (4) swapping Resend for Brevo to triple the daily email ceiling, (5) front-ending everything with Cloudflare's free CDN/WAF/analytics, (6) shipping GitHub Sponsors + a Stripe Payment Link instead of a full billing system on day one, and (7) investing the saved engineering time in the trust surface — `/terms`, `/methodology`, `/sources`, `/corrections`, public reliability page — because that's what turns a working product into a grant-fundable one.