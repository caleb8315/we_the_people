-- ============================================================================
-- Research-driven personalization preferences + minimal product telemetry
-- ============================================================================

alter table public.preferences
  add column if not exists feed_mode_preference text
    not null default 'personalized'
    check (feed_mode_preference in ('personalized', 'global', 'hybrid')),
  add column if not exists briefing_frequency_preference text
    not null default 'daily'
    check (briefing_frequency_preference in ('daily', 'weekly', 'both', 'off')),
  add column if not exists alert_intensity_preference text
    not null default 'critical_only'
    check (alert_intensity_preference in ('critical_only', 'important_and_up', 'all')),
  add column if not exists max_alerts_per_day_preference smallint
    not null default 3
    check (max_alerts_per_day_preference between 1 and 5);

alter table public.preferences
  alter column min_alert_severity set default 85;

update public.preferences
set min_alert_severity = 85
where min_alert_severity < 85
  and alert_intensity_preference = 'critical_only';

create table if not exists public.product_events (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_name  text not null check (
    event_name in (
      'feed_viewed',
      'feed_mode_switched',
      'briefing_generated',
      'briefing_opened',
      'alert_sent',
      'alert_muted',
      'preferences_updated'
    )
  ),
  event_props jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists product_events_user_created_idx
  on public.product_events (user_id, created_at desc);
create index if not exists product_events_name_created_idx
  on public.product_events (event_name, created_at desc);

alter table public.product_events enable row level security;

drop policy if exists "own product events read" on public.product_events;
create policy "own product events read" on public.product_events
  for select using (auth.uid() = user_id);

drop policy if exists "own product events insert" on public.product_events;
create policy "own product events insert" on public.product_events
  for insert with check (auth.uid() = user_id);
