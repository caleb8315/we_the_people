# Launch Plan — Open Beta to 200 Users

A staged rollout with clear exit criteria at each cohort. Each cohort only opens if the previous one met its gates.

## Cohort 1 — 20 users (Week 1)

**Goal:** prove reliability with a tight group of sympathetic testers.

- Audience: journalists, analysts, OSINT-community peers you know directly.
- Entry: open sign-up, with Supabase Auth CAPTCHA and email confirmation enabled.
- Communication: a single Slack/Discord channel or group chat.

Gates to open cohort 2:
- 48h of green ingest runs (≥ 90% success rate on `engine_runs`).
- At least one daily briefing rendered with LLM text.
- No critical bugs reported in the past 72 hours.
- ≥ 10 feedback rows captured across ≥ 5 users.

## Cohort 2 — 75 users (Week 2–3)

**Goal:** validate the product-market signal with a wider audience.

- Audience: referrals from cohort 1 + niche geopolitics / crisis-mapping communities.
- Entry: open sign-up; monitor verification quota use and abuse signals daily.
- Communication: weekly email changelog to all beta users.

Gates to open cohort 3:
- Briefing open rate ≥ 40% of sent emails.
- Useful-alert ratio ≥ 60% (from feedback).
- Weekly active returning users ≥ 30% of onboarded users.
- Zero unresolved P1 security or privacy issues.

## Cohort 3 — 200 users (Week 4–6)

**Goal:** produce traction evidence suitable for grant applications.

- Audience: public beta waitlist + targeted NGO / researcher outreach.
- Entry: open sign-up plus targeted NGO / researcher outreach.
- Communication: dedicated changelog page linked in footer, optional mailing list.

Gates to close the beta and prepare for funded scale:
- ≥ 150 WAU over a 2-week rolling window.
- At least 3 written case studies from active users.
- Sustained $0/month infra cost across the last 30 days.
- 4+ consecutive weeks with ≥ 95% ingest success.

## Weekly rituals

Every Monday (operator):

1. Export `engine_runs` summary from `/ops` as a screenshot for the journal.
2. Review feedback tags by kind; pull any `wrong` rows into a triage queue.
3. Publish a one-paragraph changelog to the `/about` or a dedicated `/changelog` page.
4. Bump the cohort status in this file (in a PR).

## Grant-readiness package

Artifacts to assemble by end of cohort 3:

- `docs/architecture.md` + a live `/ops` screenshot pack.
- 30-day reliability chart (ingest success rate per day).
- Weekly user growth + retention chart.
- 3–5 user case studies (signed quote + permitted screenshot).
- `docs/security.md` + `docs/privacy.md`.
- A one-page "what we learned from 200 users" memo for funders.
