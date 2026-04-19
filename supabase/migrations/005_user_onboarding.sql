-- ============================================================================
-- Onboarding state for authenticated workspace routing
-- ============================================================================

alter table public.profiles
  add column if not exists onboarded_at timestamptz;
