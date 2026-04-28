-- ============================================================================
-- 026 — Align product event names and retention maintenance.
--
-- Fixes two production gaps:
--   1. The app emits newer product_events names that were never added to the
--      DB-level CHECK constraint, which can silently drop telemetry writes.
--   2. Provides a small SQL function the maintenance worker can call to prune
--      old usage rows and expired signals according to the platform docs.
-- ============================================================================

alter table public.product_events
  drop constraint if exists product_events_event_name_check;

alter table public.product_events
  add constraint product_events_event_name_check check (
    event_name in (
      'feed_viewed',
      'feed_mode_switched',
      'briefing_generated',
      'briefing_opened',
      'alert_sent',
      'alert_muted',
      'preferences_updated',
      'feed_view_toggled',
      'map_opened',
      'map_filter_changed',
      'signal_opened_from_map',
      'mobile_nav_used',
      'feed_scrolled_depth',
      'saved_view_applied',
      'verify_submitted',
      'verify_result_viewed',
      'verify_shared',
      'signal_feedback_sent',
      'signal_developed'
    )
  );

create or replace function public.run_maintenance_prune(
  usage_cutoff_date date,
  signal_cutoff timestamptz
)
returns table (
  pruned_usage_rows integer,
  pruned_signal_rows integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  usage_deleted integer := 0;
  signal_deleted integer := 0;
begin
  delete from public.usage_ledger
  where day < usage_cutoff_date;

  get diagnostics usage_deleted = row_count;

  delete from public.signals
  where expires_at is not null
    and expires_at < signal_cutoff
    and not exists (
      select 1
      from public.feedback f
      where f.signal_id = public.signals.id
    )
    and not exists (
      select 1
      from public.verifications v
      where v.signal_id = public.signals.id
    );

  get diagnostics signal_deleted = row_count;

  return query
  select usage_deleted, signal_deleted;
end;
$$;

grant execute on function public.run_maintenance_prune(date, timestamptz) to service_role;
