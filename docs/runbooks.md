# Runbooks

Operational playbooks for the beta. Keep these up to date as the system evolves.

## 1. Rotate Supabase service-role key

1. Supabase Dashboard → Project Settings → API → **Generate new service role key**.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in:
   - GitHub Actions → repo secrets
   - Vercel → project environment variables (Production + Preview)
3. Redeploy the web app (Vercel auto-redeploy on env change is usually sufficient).
4. Tail Vercel logs for 10 minutes to confirm no `invalid JWT` errors.

## 2. Rotate LLM keys

- Gemini: https://aistudio.google.com/apikey → revoke old, create new → update `GEMINI_API_KEY`.
- Groq: https://console.groq.com → revoke old, create new → update `GROQ_API_KEY`.

## 3. Beta cohort onboarding

1. Add entries to `public.beta_allowlist` (one row per email, tagged with cohort).
2. Send outreach from your founder email with a link to `/login`.
3. Monitor the `auth.users` table for sign-ups; confirm invitees can create an
   email/password account after approval.

## 4. Ingestion is failing

Symptoms: `/feed` is stale, `engine_runs` rows show `status = failed`.

1. Open the latest ingest run in Supabase: `select * from engine_runs where job='ingest' order by started_at desc limit 5;`
2. Check the `errors` array.
3. If a specific adapter is failing repeatedly, set `enabled = false` in `public.sources` to skip it.
4. Manually re-run via GitHub Actions → Ingest → Run workflow.

## 5. LLM budget exhausted

Symptoms: briefings revert to deterministic bullet form; `engine_runs.meta.llm_skipped = true`.

1. Check `usage_ledger` for today: `select bucket, sum(calls) from usage_ledger where day = current_date group by 1;`
2. Raise `MAX_DAILY_LLM_CALLS_*` carefully if you have provider quota headroom.
3. If consistently over budget, reduce source count or tighten severity thresholds in `jobs/brief.ts`.

## 6. Incident response (data exposure)

1. Rotate all keys (runbooks 1 + 2).
2. Review the last 24h of `engine_runs` and Vercel logs.
3. If user PII may be involved, draft user notification within 24h and send within 72h.
4. Write a post-mortem in `docs/incidents/` (create as needed).

## 6a. Rotate worker shared secret

1. Generate a new random value of at least 16 characters for `WORKER_SHARED_SECRET`.
2. Update it in:
   - GitHub Actions secrets
   - Web deployment environment variables
   - Any local `.env` files used for worker testing
3. Re-run the `Develop signals` workflow manually and confirm `/api/signal/:id/develop`
   responds successfully for worker traffic.

## 7. Account deletion requested via email

If a user cannot log in to delete themselves:

```sql
-- Replace with the actual email.
select id from auth.users where email = 'user@example.com';
-- Then:
select auth.uid = '<id>' as ok; -- safety check
delete from auth.users where id = '<id>';
-- RLS cascades take care of profiles/preferences/feedback.
```

Confirm by rerunning the select and ensuring zero rows.

## 7a. Nightly maintenance and retention

The maintenance workflow prunes short-retention operational data and expired
signals:

- `usage_ledger` rows older than 60 days
- `signals` rows whose `expires_at` is in the past

Manual dry run:

```bash
npm run maintenance -- --dry-run
```

Live run:

```bash
npm run maintenance
```

## 8. User preference research (14-day readout)

Use this runbook after shipping personalization defaults.

### Baseline defaults

- Feed default: `personalized` with one-tap global toggle.
- Briefing default: `daily` (email enabled unless user sets `off`).
- Alerts default: `critical_only`, `max_alerts_per_day_preference = 3`, hard cap `5`.
- AI chat beta limit: `10/day`.

### Decision metrics and guardrails

- **Personalization adoption**: `% of `feed_viewed` events in `personalized` mode`.
  - Keep personalized default if `>= 60%`.
- **Global escape-rate**: `% of users switching to global from personalized`.
  - If `> 35%`, evaluate `hybrid` default for new users.
- **Alert fatigue**: `% of users with `alert_muted` within 48h of first `alert_sent``.
  - If `> 20%`, tighten defaults (raise severity threshold and/or lower default cap).
- **Briefing engagement**: `% of users generating/opening briefings at least 2 times/week`.
  - If `< 30%`, simplify briefing UX and consider weekly-first onboarding option.
- **Limit pressure**: `% of active users hitting AI daily chat limit`.
  - If `> 25%`, improve reset messaging and evaluate cap vs prompt quality tradeoff.

### SQL: mode adoption (feed)

```sql
select
  coalesce(event_props->>'mode', 'unknown') as mode,
  count(*) as events,
  round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 2) as pct
from public.product_events
where event_name = 'feed_viewed'
  and created_at >= now() - interval '14 days'
group by 1
order by events desc;
```

### SQL: global escape-rate (users)

```sql
with switches as (
  select distinct user_id
  from public.product_events
  where event_name = 'feed_mode_switched'
    and created_at >= now() - interval '14 days'
    and event_props->>'to' = 'global'
),
active as (
  select distinct user_id
  from public.product_events
  where event_name = 'feed_viewed'
    and created_at >= now() - interval '14 days'
)
select
  (select count(*) from switches) as switched_users,
  (select count(*) from active) as active_users,
  round(
    100.0 * (select count(*) from switches)::numeric
    / nullif((select count(*) from active), 0),
    2
  ) as switched_pct;
```

### SQL: alert fatigue (muted within 48h)

```sql
with first_sent as (
  select user_id, min(created_at) as first_sent_at
  from public.product_events
  where event_name = 'alert_sent'
    and created_at >= now() - interval '14 days'
  group by user_id
),
muted_48h as (
  select distinct fs.user_id
  from first_sent fs
  join public.product_events pe
    on pe.user_id = fs.user_id
   and pe.event_name = 'alert_muted'
   and pe.created_at between fs.first_sent_at and fs.first_sent_at + interval '48 hours'
)
select
  (select count(*) from first_sent) as alerted_users,
  (select count(*) from muted_48h) as muted_in_48h_users,
  round(
    100.0 * (select count(*) from muted_48h)::numeric
    / nullif((select count(*) from first_sent), 0),
    2
  ) as muted_in_48h_pct;
```

### SQL: briefing engagement

```sql
select
  count(distinct user_id) filter (where events >= 4) as engaged_users,
  count(distinct user_id) as users_opening_or_generating,
  round(
    100.0 * count(distinct user_id) filter (where events >= 4)::numeric
    / nullif(count(distinct user_id), 0),
    2
  ) as engaged_pct
from (
  select user_id, count(*) as events
  from public.product_events
  where event_name in ('briefing_opened', 'briefing_generated')
    and created_at >= now() - interval '14 days'
  group by user_id
) x;
```

### SQL: AI daily limit pressure

```sql
with active_users as (
  select distinct user_id
  from public.user_daily_usage
  where day >= current_date - 14
    and bucket = 'ai_chat'
),
maxed as (
  select user_id
  from public.user_daily_usage
  where day >= current_date - 14
    and bucket = 'ai_chat'
  group by user_id, day
  having sum(calls) >= 10
)
select
  (select count(distinct user_id) from active_users) as active_chat_users,
  (select count(distinct user_id) from maxed) as users_hitting_limit,
  round(
    100.0 * (select count(distinct user_id) from maxed)::numeric
    / nullif((select count(distinct user_id) from active_users), 0),
    2
  ) as limit_hit_pct;
```

### SQL: map usage and effectiveness (7d)

```sql
with feed as (
  select event_props
  from public.product_events
  where event_name = 'feed_viewed'
    and created_at >= now() - interval '7 days'
)
select
  count(*) as feed_views,
  count(*) filter (where event_props->>'view' = 'map') as map_feed_views,
  round(
    100.0 * count(*) filter (where event_props->>'view' = 'map')::numeric
    / nullif(count(*), 0),
    2
  ) as map_feed_share_pct
from feed;

select
  count(*) filter (where event_name = 'map_opened') as map_opened,
  count(*) filter (where event_name = 'signal_opened_from_map') as map_signal_opened,
  round(
    100.0 * count(*) filter (where event_name = 'signal_opened_from_map')::numeric
    / nullif(count(*) filter (where event_name = 'map_opened'), 0),
    2
  ) as map_open_to_signal_open_pct
from public.product_events
where event_name in ('map_opened', 'signal_opened_from_map')
  and created_at >= now() - interval '7 days';
```

### SQL: mobile navigation adoption (7d)

```sql
select
  count(*) as mobile_nav_actions
from public.product_events
where event_name = 'mobile_nav_used'
  and created_at >= now() - interval '7 days';
```

### SQL: saved view adoption (7d)

```sql
select
  count(*) as saved_view_events,
  count(*) filter (where event_props->>'action' = 'created') as presets_created
from public.product_events
where event_name = 'saved_view_applied'
  and created_at >= now() - interval '7 days';
```
