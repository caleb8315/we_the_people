-- ============================================================================
-- Deep dives: per-signal or per-URL research reports.
-- Cached so the same signal doesn't get researched twice.
-- ============================================================================

create table if not exists public.deep_dives (
  id              uuid primary key default uuid_generate_v4(),
  signal_id       uuid references public.signals(id) on delete cascade,
  source_url      text,
  status          text not null default 'pending' check (status in ('pending','running','complete','failed')),
  claims          jsonb not null default '[]'::jsonb,
  research        jsonb not null default '[]'::jsonb,
  sensor_data     jsonb not null default '{}'::jsonb,
  synthesis       jsonb not null default '{}'::jsonb,
  summary         text,
  overall_verdict text check (overall_verdict in ('corroborated','mixed','disputed','unverified')),
  auto_generated  boolean not null default false,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  raw_data        jsonb not null default '{}'::jsonb
);

create index if not exists idx_deep_dives_signal on public.deep_dives(signal_id);
create index if not exists idx_deep_dives_status on public.deep_dives(status);

-- Public read access (same RLS pattern as signals_public)
alter table public.deep_dives enable row level security;
create policy "deep_dives_anon_read" on public.deep_dives
  for select using (status = 'complete');
