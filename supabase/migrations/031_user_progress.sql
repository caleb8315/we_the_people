-- 031 — Optional server-side progress for the people-first gamification layer.
-- Client localStorage remains the primary store so guests can play immediately;
-- this table lets signed-in users persist XP / streak / badges later.

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  streak integer not null default 0 check (streak >= 0),
  last_active_day date,
  mission_day date,
  missions jsonb not null default '{"verify_claim":0,"scout_signals":0,"check_dispute":0}'::jsonb,
  completed_missions text[] not null default '{}',
  unlocked_badges text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

create policy user_progress_select_own
  on public.user_progress for select
  using (auth.uid() = user_id);

create policy user_progress_upsert_own
  on public.user_progress for insert
  with check (auth.uid() = user_id);

create policy user_progress_update_own
  on public.user_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
