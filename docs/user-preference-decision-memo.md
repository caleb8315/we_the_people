# User Preference Decision Memo (14-Day)

Use this memo after each 14-day beta window to decide whether to keep or change defaults.

## Window

- Start date: YYYY-MM-DD
- End date: YYYY-MM-DD
- Cohort size: N users

## Defaults under evaluation

- Feed mode default: `personalized`
- Feed view default: `list` (with map available on feed/intel)
- Briefing frequency default: `daily`
- Alert defaults:
  - `alert_intensity_preference = critical_only`
  - `max_alerts_per_day_preference = 3`
  - hard cap = 5/day
- AI chat limit: 10/day (beta)

## Readout

- Personalization adoption (% feed_viewed in personalized):
  - Result: __%
  - Guardrail: >= 60%
  - Pass/Fail: __
- Map adoption (% feed_viewed in map view):
  - Result: __%
  - Guardrail: >= 20%
  - Pass/Fail: __
- Map utility (signal_opened_from_map / map_opened):
  - Result: __
  - Guardrail: trending upward cohort-over-cohort
  - Pass/Fail: __
- Mobile feed share (% feed_viewed with is_mobile=true):
  - Result: __%
  - Guardrail: stable or increasing without alert fatigue increases
  - Pass/Fail: __
- Global escape-rate (% users switching to global):
  - Result: __%
  - Guardrail: <= 35%
  - Pass/Fail: __
- Alert fatigue (% users muted within 48h of first alert):
  - Result: __%
  - Guardrail: <= 20%
  - Pass/Fail: __
- Briefing engagement (% users with >=4 briefing events in 14 days):
  - Result: __%
  - Guardrail: >= 30%
  - Pass/Fail: __
- AI limit pressure (% active chat users hitting 10/day):
  - Result: __%
  - Guardrail: <= 25%
  - Pass/Fail: __

## Decision

- Keep current defaults: yes/no
- Changes for next cohort:
  - Feed:
  - Briefings:
  - Alerts:
  - AI limit messaging:

## Rationale (evidence)

- Key findings:
  - 
  - 
- Risks:
  - 

## Next experiments

- Experiment 1:
- Experiment 2:
- Experiment 3:

## Suggested SQL add-ons for map/mobile validation

```sql
-- Map adoption in feed views (14d)
select
  round(
    100.0 * count(*) filter (where event_props->>'view' = 'map')::numeric
    / nullif(count(*), 0),
    2
  ) as map_feed_pct
from public.product_events
where event_name = 'feed_viewed'
  and created_at >= now() - interval '14 days';

-- Map utility ratio (14d)
with opened as (
  select count(*) as n
  from public.product_events
  where event_name = 'map_opened'
    and created_at >= now() - interval '14 days'
),
clicked as (
  select count(*) as n
  from public.product_events
  where event_name = 'signal_opened_from_map'
    and created_at >= now() - interval '14 days'
)
select
  clicked.n as map_signal_opens,
  opened.n as map_opens,
  round(100.0 * clicked.n::numeric / nullif(opened.n, 0), 2) as map_open_to_signal_pct
from opened, clicked;

-- Mobile feed share (14d)
select
  round(
    100.0 * count(*) filter (where coalesce((event_props->>'is_mobile')::boolean, false))::numeric
    / nullif(count(*), 0),
    2
  ) as mobile_feed_pct
from public.product_events
where event_name = 'feed_viewed'
  and created_at >= now() - interval '14 days';
```
