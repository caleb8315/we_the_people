-- ============================================================================
-- 021 — Phase 5 KPI views (verifications + source health).
--
-- Aggregates for the ops dashboard without additional app-layer code:
--
--   • verifications_daily — one row per (day, band) for the /verify flow
--     volume + band mix. Feeds the "false-high-confidence incidents"
--     and "verification usefulness" KPIs.
--
--   • source_health_current — latest status per source so the ops page
--     can show degraded/failed adapters at a glance.
--
-- These are views, not tables. No backfill needed; they re-derive from
-- the underlying tables on every read. Grant SELECT to authenticated +
-- service_role; anonymous readers continue to hit the base tables
-- through existing RLS.
-- ============================================================================

create or replace view public.verifications_daily as
select
  date_trunc('day', created_at)     as day,
  confidence_band                    as band,
  kind,
  count(*)::integer                  as submissions,
  count(*) filter (where is_social)  as social_submissions
from public.verifications
group by 1, 2, 3;

grant select on public.verifications_daily to authenticated, service_role;

create or replace view public.source_health_current as
select distinct on (source_id)
  source_id,
  run_at,
  status,
  latency_ms,
  items_fetched,
  error
from public.source_health
order by source_id, run_at desc;

grant select on public.source_health_current to anon, authenticated, service_role;
