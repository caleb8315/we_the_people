-- ============================================================================
-- UX research instrumentation + user map/list presets
-- ============================================================================

alter table public.preferences
  add column if not exists feed_view_preference text
    not null default 'list'
    check (feed_view_preference in ('list', 'map')),
  add column if not exists signal_density_preference text
    not null default 'comfortable'
    check (signal_density_preference in ('compact', 'comfortable'));

create table if not exists public.user_saved_views (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  context     text not null check (context in ('feed', 'intel')),
  view_mode   text not null check (view_mode in ('list', 'map')),
  filters     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists user_saved_views_user_context_idx
  on public.user_saved_views (user_id, context, updated_at desc);

alter table public.user_saved_views enable row level security;

drop policy if exists "own saved views read" on public.user_saved_views;
create policy "own saved views read" on public.user_saved_views
  for select using (auth.uid() = user_id);

drop policy if exists "own saved views insert" on public.user_saved_views;
create policy "own saved views insert" on public.user_saved_views
  for insert with check (auth.uid() = user_id);

drop policy if exists "own saved views update" on public.user_saved_views;
create policy "own saved views update" on public.user_saved_views
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own saved views delete" on public.user_saved_views;
create policy "own saved views delete" on public.user_saved_views
  for delete using (auth.uid() = user_id);

create or replace function public.touch_user_saved_view() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_saved_views_touch on public.user_saved_views;
create trigger user_saved_views_touch
  before update on public.user_saved_views
  for each row execute function public.touch_user_saved_view();

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
      'saved_view_applied'
    )
  );
