-- ============================================================================
-- Operator alerts (self-monitoring)
-- ============================================================================
-- Records every operator alert the background worker emits (job failures,
-- fatal crashes, ingest-freshness watchdog) plus which delivery channels
-- succeeded. A unique `dedupe_key` lets the worker collapse a storm of
-- identical failures into a single notification per throttle window, so a
-- broken cron cannot flood the operator inbox.
--
-- Only the service role touches this table (RLS is on with no policies), so
-- it is never exposed to end users.

create table if not exists public.operator_alerts (
  id              uuid primary key default uuid_generate_v4(),
  dedupe_key      text not null,
  severity        text not null default 'error' check (severity in ('info', 'warn', 'error')),
  subject         text not null,
  body            text,
  channels        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- One alert per dedupe window. The worker builds the key as
-- "<source>:<bucket>" (e.g. "engine_run:alert:2026-07-01T02"), so repeated
-- failures inside the same window hit this unique index and are suppressed.
create unique index if not exists operator_alerts_dedupe_key_uidx
  on public.operator_alerts (dedupe_key);

create index if not exists operator_alerts_created_idx
  on public.operator_alerts (created_at desc);

alter table public.operator_alerts enable row level security;
-- No policies: the service-role worker bypasses RLS; anon/auth users get
-- nothing. This keeps operational failure detail out of the public surface.
