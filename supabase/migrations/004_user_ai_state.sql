-- ============================================================================
-- Per-user AI state (MVP multi-tenant isolation)
--
-- This replaces the need for per-user Docker containers at MVP stage.
-- Each user gets isolated AI profile/session/message rows under strict RLS.
-- ============================================================================

create table if not exists public.ai_profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  model              text not null default 'gemini-2.0-flash',
  system_prompt      text not null default 'You are a neutral OSINT analyst. Cite evidence and avoid accusations.',
  temperature        numeric(3,2) not null default 0.40,
  max_output_tokens  int not null default 600,
  container_hint     text, -- reserved for future per-user runtime routing
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.ai_sessions (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  title              text not null default 'New chat',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists ai_sessions_user_idx on public.ai_sessions (user_id, updated_at desc);

create table if not exists public.ai_messages (
  id                 uuid primary key default uuid_generate_v4(),
  session_id         uuid not null references public.ai_sessions(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  role               text not null check (role in ('user','assistant','system')),
  content            text not null,
  provider           text,
  created_at         timestamptz not null default now()
);

create index if not exists ai_messages_session_idx on public.ai_messages (session_id, created_at asc);
create index if not exists ai_messages_user_idx on public.ai_messages (user_id, created_at desc);

alter table public.ai_profiles enable row level security;
alter table public.ai_sessions enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "own ai profile read" on public.ai_profiles;
create policy "own ai profile read" on public.ai_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "own ai profile upsert" on public.ai_profiles;
create policy "own ai profile upsert" on public.ai_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "own ai profile update" on public.ai_profiles;
create policy "own ai profile update" on public.ai_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own ai sessions read" on public.ai_sessions;
create policy "own ai sessions read" on public.ai_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "own ai sessions insert" on public.ai_sessions;
create policy "own ai sessions insert" on public.ai_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists "own ai sessions update" on public.ai_sessions;
create policy "own ai sessions update" on public.ai_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own ai sessions delete" on public.ai_sessions;
create policy "own ai sessions delete" on public.ai_sessions
  for delete using (auth.uid() = user_id);

drop policy if exists "own ai messages read" on public.ai_messages;
create policy "own ai messages read" on public.ai_messages
  for select using (auth.uid() = user_id);

drop policy if exists "own ai messages insert" on public.ai_messages;
create policy "own ai messages insert" on public.ai_messages
  for insert with check (auth.uid() = user_id);
