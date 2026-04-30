-- ============================================================================
-- In-app user notifications (daily briefings + priority alerts)
-- ============================================================================

alter table public.preferences
  add column if not exists notifications_enabled boolean not null default true;

alter table public.briefing_deliveries
  alter column email drop not null;

alter table public.briefing_deliveries
  drop constraint if exists briefing_deliveries_status_check;

alter table public.briefing_deliveries
  add constraint briefing_deliveries_status_check
  check (status in ('sent', 'failed', 'skipped'));

create table if not exists public.user_notifications (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null check (type in ('daily_briefing', 'priority_alert', 'summary')),
  title        text not null,
  summary      text not null,
  body         text not null,
  signal_id    uuid references public.signals(id) on delete set null,
  briefing_id  uuid references public.briefings(id) on delete set null,
  data         jsonb not null default '{}'::jsonb,
  is_read      boolean not null default false,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id, is_read, created_at desc);

create unique index if not exists user_notifications_unique_signal_idx
  on public.user_notifications (user_id, type, signal_id)
  where signal_id is not null;

create unique index if not exists user_notifications_unique_briefing_idx
  on public.user_notifications (user_id, type, briefing_id)
  where briefing_id is not null;

alter table public.user_notifications enable row level security;

drop policy if exists "own notifications read" on public.user_notifications;
create policy "own notifications read" on public.user_notifications
  for select using (auth.uid() = user_id);

drop policy if exists "own notifications update" on public.user_notifications;
create policy "own notifications update" on public.user_notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
