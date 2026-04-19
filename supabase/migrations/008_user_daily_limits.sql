-- ============================================================================
-- Per-user daily usage limits for beta guardrails
-- ============================================================================

create table if not exists public.user_daily_usage (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  day          date not null,
  bucket       text not null check (bucket in ('ai_chat', 'priority_alert', 'daily_briefing', 'briefing_call')),
  calls        int not null default 1,
  created_at   timestamptz not null default now()
);

create index if not exists user_daily_usage_idx
  on public.user_daily_usage (user_id, day, bucket);

alter table public.user_daily_usage enable row level security;

drop policy if exists "own usage read" on public.user_daily_usage;
create policy "own usage read" on public.user_daily_usage
  for select using (auth.uid() = user_id);

drop policy if exists "own usage insert" on public.user_daily_usage;
create policy "own usage insert" on public.user_daily_usage
  for insert with check (auth.uid() = user_id);

create table if not exists public.alert_deliveries (
  id           uuid primary key default uuid_generate_v4(),
  signal_id    uuid not null references public.signals(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  email        text,
  status       text not null check (status in ('sent', 'failed', 'skipped')),
  error        text,
  sent_at      timestamptz not null default now(),
  unique (signal_id, user_id)
);

create index if not exists alert_deliveries_sent_idx
  on public.alert_deliveries (sent_at desc);

alter table public.alert_deliveries enable row level security;
-- service-role only by default
