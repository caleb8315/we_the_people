-- ============================================================================
-- 035 — Deep investigations.
--
-- Stores the full report produced by the agentic investigator
-- (@osint/investigator): verdict, per-claim citations that passed quote
-- verification, perspectives by country/outlet type, physical/satellite
-- checks, origin, and coverage/integrity metadata.
--
-- Design rules:
--   • User scoped: signed-in users can read and delete their own reports;
--     anonymous investigations are streamed back but not persisted.
--   • The full report is kept as JSONB (the contract lives in
--     packages/investigator/src/schema.ts); headline columns are denormalised
--     for listing and analytics.
-- ============================================================================

create table if not exists public.investigations (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  input_kind      text not null check (input_kind in ('url','text')),
  input_url       text,
  input_text      text,
  headline_claim  text not null,
  verdict         text not null check (verdict in ('true','mostly_true','mixed','misleading','unproven','false','fabricated')),
  confidence      text not null check (confidence in ('low','medium','high')),
  conspiracy_level text not null default 'none' check (conspiracy_level in ('none','some_traits','strong')),
  languages       text[] not null default '{}'::text[],
  countries       text[] not null default '{}'::text[],
  sources_found   integer not null default 0,
  sources_read    integer not null default 0,
  physical_checks integer not null default 0,
  model           text,
  duration_ms     integer,
  report          jsonb not null,
  created_at      timestamptz not null default now()
);

create index if not exists investigations_user_idx
  on public.investigations (user_id, created_at desc);
create index if not exists investigations_verdict_idx
  on public.investigations (verdict);

alter table public.investigations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'investigations'
      and policyname = 'investigations_self_select'
  ) then
    create policy investigations_self_select on public.investigations
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'investigations'
      and policyname = 'investigations_self_insert'
  ) then
    create policy investigations_self_insert on public.investigations
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'investigations'
      and policyname = 'investigations_self_delete'
  ) then
    create policy investigations_self_delete on public.investigations
      for delete using (auth.uid() = user_id);
  end if;
end
$$;

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
      'saved_view_created',
      'verify_submitted',
      'verify_result_viewed',
      'verify_shared',
      'signal_feedback_sent',
      'signal_developed',
      'investigation_completed'
    )
  );
