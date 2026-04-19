-- ============================================================================
-- OSINT Platform · Initial Schema (v1)
--
-- Design principles:
--   • Anonymous-first: signals/briefings are public-readable.
--   • Per-user rows (prefs, feedback) are protected with strict RLS.
--   • Service role (worker) bypasses RLS for writes.
--   • No PII beyond the auth.users row managed by Supabase.
-- ============================================================================

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ── sources ────────────────────────────────────────────────────────────────
create table if not exists public.sources (
  id              text primary key,                    -- e.g. "reuters-world"
  name            text not null,
  kind            text not null check (kind in ('rss','api','dataset','official','social')),
  url             text,
  country_code    text,
  credibility     smallint not null default 50 check (credibility between 0 and 100),
  is_credible     boolean generated always as (credibility >= 70) stored,
  enabled         boolean not null default true,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- ── signals ────────────────────────────────────────────────────────────────
-- A signal is a deduped, normalized event observation.
create table if not exists public.signals (
  id                  uuid primary key default uuid_generate_v4(),
  dedupe_key          text unique not null,
  title               text not null,
  summary             text,
  url                 text,
  source_id           text references public.sources(id) on delete set null,
  topic               text,                                 -- war|economy|climate|health|civil|cyber|other
  country_code        text,
  severity            smallint not null default 30 check (severity between 0 and 100),
  confidence          smallint not null default 40 check (confidence between 0 and 100),
  verification_status text not null default 'unverified'
                      check (verification_status in ('unverified','developing','verified','quarantined','blocked')),
  source_count        smallint not null default 1,
  credible_source_count smallint not null default 0,
  distinct_domains    text[] not null default '{}'::text[],
  tags                text[] not null default '{}'::text[],
  occurred_at         timestamptz,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  expires_at          timestamptz,
  raw_data            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists signals_first_seen_idx on public.signals (first_seen_at desc);
create index if not exists signals_topic_idx      on public.signals (topic);
create index if not exists signals_status_idx     on public.signals (verification_status);
create index if not exists signals_country_idx    on public.signals (country_code);
create index if not exists signals_severity_idx   on public.signals (severity desc);

-- ── evidence (per-signal citations) ────────────────────────────────────────
create table if not exists public.evidence (
  id              uuid primary key default uuid_generate_v4(),
  signal_id       uuid not null references public.signals(id) on delete cascade,
  source_id       text references public.sources(id) on delete set null,
  url             text,
  domain          text,
  title           text,
  published_at    timestamptz,
  is_credible     boolean not null default false,
  excerpt         text,
  created_at      timestamptz not null default now()
);

create index if not exists evidence_signal_idx on public.evidence (signal_id);

-- ── contradictions ─────────────────────────────────────────────────────────
-- Neutral wording: "inconsistency" between claim and observed data.
create table if not exists public.contradictions (
  id              uuid primary key default uuid_generate_v4(),
  signal_id       uuid not null references public.signals(id) on delete cascade,
  claim           text not null,
  observation     text not null,
  explanation     text,
  confidence      smallint not null default 50 check (confidence between 0 and 100),
  evidence_ids    uuid[] not null default '{}'::uuid[],
  created_at      timestamptz not null default now()
);

create index if not exists contradictions_signal_idx on public.contradictions (signal_id);

-- ── briefings ──────────────────────────────────────────────────────────────
create table if not exists public.briefings (
  id              uuid primary key default uuid_generate_v4(),
  kind            text not null check (kind in ('daily','weekly')),
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  headline        text not null,
  body_markdown   text not null,
  signal_ids      uuid[] not null default '{}'::uuid[],
  topics          text[] not null default '{}'::text[],
  created_at      timestamptz not null default now()
);

create unique index if not exists briefings_kind_period_idx
  on public.briefings (kind, period_start);

-- ── user profiles (pseudonymous) ───────────────────────────────────────────
create table if not exists public.profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  display_name    text,                                 -- pseudonym allowed
  created_at      timestamptz not null default now()
);

-- ── user preferences ───────────────────────────────────────────────────────
create table if not exists public.preferences (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  topics              text[] not null default array['war','economy','climate']::text[],
  muted_sources       text[] not null default '{}'::text[],
  muted_topics        text[] not null default '{}'::text[],
  countries_of_focus  text[] not null default '{}'::text[],
  email_briefings     boolean not null default true,
  alerts_enabled      boolean not null default true,
  min_alert_severity  smallint not null default 70 check (min_alert_severity between 0 and 100),
  updated_at          timestamptz not null default now()
);

-- ── feedback (useful / noise) ─────────────────────────────────────────────
create table if not exists public.feedback (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  signal_id       uuid references public.signals(id) on delete cascade,
  briefing_id     uuid references public.briefings(id) on delete cascade,
  kind            text not null check (kind in ('useful','noise','wrong','helpful_context')),
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);

-- ── usage tracking (global AI budget) ──────────────────────────────────────
create table if not exists public.usage_ledger (
  id              uuid primary key default uuid_generate_v4(),
  day             date not null,
  bucket          text not null,          -- briefing|signals|contradiction
  calls           int  not null default 1,
  created_at      timestamptz not null default now()
);

create index if not exists usage_day_bucket_idx on public.usage_ledger (day, bucket);

-- ── engine runs (observability) ────────────────────────────────────────────
create table if not exists public.engine_runs (
  id              uuid primary key default uuid_generate_v4(),
  job             text not null,           -- ingest|brief|alert
  status          text not null default 'running' check (status in ('running','success','partial','failed')),
  records_in      int  default 0,
  records_out     int  default 0,
  errors          text[] not null default '{}'::text[],
  meta            jsonb not null default '{}'::jsonb,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

-- ── beta allowlist (private beta control) ─────────────────────────────────
create table if not exists public.beta_allowlist (
  email           text primary key,
  invited_by      text,
  cohort          text,                    -- cohort1|cohort2|cohort3
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.sources         enable row level security;
alter table public.signals         enable row level security;
alter table public.evidence        enable row level security;
alter table public.contradictions  enable row level security;
alter table public.briefings       enable row level security;
alter table public.profiles        enable row level security;
alter table public.preferences     enable row level security;
alter table public.feedback        enable row level security;
alter table public.usage_ledger    enable row level security;
alter table public.engine_runs     enable row level security;
alter table public.beta_allowlist  enable row level security;

-- Public read (anonymous-first) for discovery tables.
-- Only non-quarantined / non-blocked signals are visible.
drop policy if exists "public read signals" on public.signals;
create policy "public read signals" on public.signals
  for select using (verification_status in ('verified','developing','unverified'));

drop policy if exists "public read sources" on public.sources;
create policy "public read sources" on public.sources
  for select using (enabled = true);

drop policy if exists "public read evidence" on public.evidence;
create policy "public read evidence" on public.evidence
  for select using (true);

drop policy if exists "public read contradictions" on public.contradictions;
create policy "public read contradictions" on public.contradictions
  for select using (true);

drop policy if exists "public read briefings" on public.briefings;
create policy "public read briefings" on public.briefings
  for select using (true);

-- Profiles: user reads/updates only their own row.
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "own profile upsert" on public.profiles;
create policy "own profile upsert" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Preferences: same pattern.
drop policy if exists "own preferences read" on public.preferences;
create policy "own preferences read" on public.preferences
  for select using (auth.uid() = user_id);

drop policy if exists "own preferences upsert" on public.preferences;
create policy "own preferences upsert" on public.preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "own preferences update" on public.preferences;
create policy "own preferences update" on public.preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Feedback: a user may create & read only their own feedback rows.
drop policy if exists "own feedback read" on public.feedback;
create policy "own feedback read" on public.feedback
  for select using (auth.uid() = user_id);

drop policy if exists "own feedback insert" on public.feedback;
create policy "own feedback insert" on public.feedback
  for insert with check (auth.uid() = user_id);

-- Engine runs / usage ledger / allowlist: no public access; service role only.
-- (RLS enabled + no policies = default deny for anon/auth roles.)

-- ============================================================================
-- HELPFUL VIEWS
-- ============================================================================

create or replace view public.signals_public as
  select
    s.id, s.title, s.summary, s.url, s.source_id, s.topic, s.country_code,
    s.severity, s.confidence, s.verification_status, s.source_count,
    s.credible_source_count, s.distinct_domains, s.tags,
    s.occurred_at, s.first_seen_at, s.last_seen_at
  from public.signals s
  where s.verification_status in ('verified','developing','unverified')
    and (s.expires_at is null or s.expires_at > now());

grant select on public.signals_public to anon, authenticated;

-- Upsert trigger to keep last_seen_at fresh on dedupe-key conflicts.
create or replace function public.touch_signal() returns trigger as $$
begin
  new.last_seen_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists signals_touch on public.signals;
create trigger signals_touch
  before update on public.signals
  for each row execute function public.touch_signal();
