# Beta Metrics

What we measure and how we read it. All metrics computable from Supabase directly — no external analytics service.

## North-star metrics

1. **Useful-alert ratio** — `feedback.kind = 'useful'` / total feedback rows in the past 7 days.
2. **Weekly retained users** — `auth.users` with ≥ 1 action (feedback, preferences save, login) in both the current and previous 7-day window.
3. **Briefing engagement** — distinct users who opened a briefing in the last 7 days / distinct users with `email_briefings = true`.

## Operational metrics

- Ingest success rate: `engine_runs` where `job='ingest'` and `status='success'` over the last 24h.
- LLM budget utilization: `sum(usage_ledger.calls)` per day / `MAX_DAILY_LLM_CALLS`.
- Alert precision proxy: `feedback.kind = 'noise'` on alerted signals / total alerted signals.

## Sample queries

```sql
-- Useful-alert ratio (7d)
select
  count(*) filter (where kind = 'useful')::float
    / nullif(count(*), 0) as useful_ratio
from public.feedback
where created_at > now() - interval '7 days';

-- Weekly retained users
with recent as (
  select distinct user_id from public.feedback
  where created_at > now() - interval '7 days'
),
prior as (
  select distinct user_id from public.feedback
  where created_at between now() - interval '14 days' and now() - interval '7 days'
)
select count(*) as retained
from recent r
join prior p using (user_id);

-- Ingest reliability (24h)
select
  count(*) filter (where status = 'success')::float / nullif(count(*), 0) as success_rate
from public.engine_runs
where job = 'ingest' and started_at > now() - interval '24 hours';
```

## What good looks like (beta)

- Useful-alert ratio ≥ 0.60
- Weekly retained users ≥ 30% of onboarded
- Ingest success rate ≥ 0.95
- LLM budget utilization ≤ 0.80 on average (safety headroom)
