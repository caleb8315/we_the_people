-- ============================================================================
-- User-specific delivery + weather location fields
-- ============================================================================

alter table public.preferences
  add column if not exists weather_lat numeric(8,5),
  add column if not exists weather_lon numeric(8,5),
  add column if not exists weather_label text;

create table if not exists public.briefing_deliveries (
  id            uuid primary key default uuid_generate_v4(),
  briefing_id   uuid not null references public.briefings(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  status        text not null check (status in ('sent', 'failed')),
  error         text,
  sent_at       timestamptz not null default now(),
  unique (briefing_id, user_id)
);

create index if not exists briefing_deliveries_sent_idx
  on public.briefing_deliveries (sent_at desc);

alter table public.briefing_deliveries enable row level security;
-- Service-role only by default (no policies).
