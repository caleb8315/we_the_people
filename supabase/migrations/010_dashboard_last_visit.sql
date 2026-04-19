-- ============================================================================
-- Track last dashboard visit timestamp per user to power "new since last visit"
-- ============================================================================

alter table public.profiles
  add column if not exists last_dashboard_visit_at timestamptz;
