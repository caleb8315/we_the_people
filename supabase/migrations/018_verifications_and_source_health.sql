-- ============================================================================
-- 018 — Verifications (user-submitted verification requests).
--
-- Phase 2 of the Crosscheck build plan adds a user-facing /verify flow.
-- A verification is a user's request to have a URL, pasted claim, or
-- screenshot run through the same confidence engine that drives the feed.
--
-- Design rules:
--   • Anonymous users may POST a verification (rate-limited in the app),
--     but only authenticated users get a persistent record they can view.
--   • Verification records never reach the public feed directly — they are
--     scoped per-user via RLS. Upstream corroboration is recorded via the
--     existing signals/evidence tables.
--   • The confidence_report column stores the JSON output of
--     `buildConfidenceReport` so we can replay what the user saw without
--     re-running the engine.
--
-- Backfill/compatibility: zero existing rows to migrate. The feed schema is
-- untouched; this is additive.
-- ============================================================================

create table if not exists public.verifications (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid references auth.users(id) on delete set null,
  kind                text not null check (kind in ('url','text','image')),
  input_url           text,
  input_text          text,
  image_filename      text,
  image_sha256        text,
  -- Derived metadata from @osint/core helpers at submission time.
  platform            text,
  host                text,
  is_social           boolean not null default false,
  provenance_tags     text[] not null default '{}'::text[],
  -- The unified ConfidenceReport payload the user saw at submission time.
  confidence_band     text not null check (confidence_band in ('high','medium','low','contested')),
  confidence_report   jsonb not null default '{}'::jsonb,
  -- If the worker linked this submission to an existing signal during
  -- corroboration, record it here. Nullable so we can store standalone
  -- verifications (e.g. a quoted text that has no matching news signal).
  signal_id           uuid references public.signals(id) on delete set null,
  status              text not null default 'ready'
                      check (status in ('ready','pending','failed')),
  created_at          timestamptz not null default now()
);

create index if not exists verifications_user_id_idx on public.verifications (user_id, created_at desc);
create index if not exists verifications_signal_id_idx on public.verifications (signal_id);
create index if not exists verifications_band_idx on public.verifications (confidence_band);

alter table public.verifications enable row level security;

-- Authenticated users can read their own submissions.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'verifications'
      and policyname = 'verifications_self_select'
  ) then
    create policy verifications_self_select on public.verifications
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Authenticated users can insert their own submissions.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'verifications'
      and policyname = 'verifications_self_insert'
  ) then
    create policy verifications_self_insert on public.verifications
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- Ops / service-role may read everything (for moderation + benchmark work).
grant select, insert on public.verifications to service_role;

-- ── source_health ─────────────────────────────────────────────────────────
-- Phase 4 needs per-source uptime / freshness / parse-success tracking to
-- prevent any one ecosystem from dominating confidence. We introduce the
-- table now (additive) so the worker can start writing to it as soon as
-- the Phase-4 adapters land, without a separate migration.
--
-- One row per source per hourly run. Worker writes are service-role only;
-- reads are public so the ops page can surface health without auth.

create table if not exists public.source_health (
  id              uuid primary key default uuid_generate_v4(),
  source_id       text not null references public.sources(id) on delete cascade,
  run_at          timestamptz not null default now(),
  status          text not null check (status in ('ok','degraded','failed')),
  latency_ms      integer,
  items_fetched   integer not null default 0,
  error           text
);

create index if not exists source_health_source_id_idx
  on public.source_health (source_id, run_at desc);

alter table public.source_health enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'source_health'
      and policyname = 'source_health_public_read'
  ) then
    create policy source_health_public_read on public.source_health
      for select using (true);
  end if;
end $$;

grant select on public.source_health to anon, authenticated;
grant insert, select on public.source_health to service_role;
