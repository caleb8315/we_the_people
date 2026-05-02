-- ============================================================================
-- 028 — Verification case files and claim-level evidence.
--
-- Crosscheck Case Files turn a verification from one overall confidence report
-- into a durable map of checkable claims, evidence stances, uncertainty, and
-- "what would resolve this" guidance.
--
-- Design rules:
--   • Additive: the existing verifications table remains valid.
--   • User scoped: authenticated users can read their own case files; anonymous
--     users still get case-file JSON in the API response, but nothing persists.
--   • Evidence-bound: claim verdicts are stored as outputs of deterministic
--     core analysis, not as model-generated truth labels.
-- ============================================================================

create table if not exists public.verification_cases (
  id                     uuid primary key default uuid_generate_v4(),
  user_id                uuid references auth.users(id) on delete set null,
  verification_id        uuid references public.verifications(id) on delete set null,
  input_kind             text not null check (input_kind in ('url','text','image')),
  input_url              text,
  input_text             text,
  title                  text not null,
  overall_verdict        text not null,
  overall_band           text not null check (overall_band in ('high','medium','low','contested')),
  overall_summary        text not null,
  what_we_can_say        text[] not null default '{}'::text[],
  what_remains_uncertain text[] not null default '{}'::text[],
  what_would_strengthen  text[] not null default '{}'::text[],
  case_file              jsonb not null default '{}'::jsonb,
  status                 text not null default 'ready' check (status in ('ready','pending','failed')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.verifications
  add column if not exists case_file jsonb;

create index if not exists verification_cases_user_idx
  on public.verification_cases (user_id, created_at desc);
create index if not exists verification_cases_verification_idx
  on public.verification_cases (verification_id);
create index if not exists verification_cases_verdict_idx
  on public.verification_cases (overall_verdict);

create table if not exists public.verification_claims (
  id                  uuid primary key default uuid_generate_v4(),
  case_id             uuid not null references public.verification_cases(id) on delete cascade,
  claim_key           text not null,
  claim_text          text not null,
  normalized_text     text not null,
  claim_kind          text not null,
  checkability        text not null,
  risk_level          text not null,
  entities            text[] not null default '{}'::text[],
  dates               text[] not null default '{}'::text[],
  locations           text[] not null default '{}'::text[],
  verdict_label       text not null,
  confidence_band     text not null check (confidence_band in ('high','medium','low','contested')),
  confidence_score    smallint not null check (confidence_score between 0 and 100),
  support_count       integer not null default 0,
  contradiction_count integer not null default 0,
  context_count       integer not null default 0,
  summary             text not null,
  uncertainty         jsonb not null default '{}'::jsonb,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists verification_claims_case_idx
  on public.verification_claims (case_id, sort_order);
create index if not exists verification_claims_kind_idx
  on public.verification_claims (claim_kind);
create index if not exists verification_claims_verdict_idx
  on public.verification_claims (verdict_label);

create table if not exists public.claim_evidence (
  id                    uuid primary key default uuid_generate_v4(),
  claim_id              uuid not null references public.verification_claims(id) on delete cascade,
  url                   text not null,
  domain                text not null,
  title                 text,
  excerpt               text,
  published_at          timestamptz,
  source_role           text,
  source_rank           integer,
  source_score          smallint check (source_score is null or source_score between 0 and 100),
  source_components     jsonb,
  is_credible           boolean not null default false,
  stance                text not null,
  stance_confidence     smallint not null check (stance_confidence between 0 and 100),
  explanation           text not null,
  retrieved_via         text,
  created_at            timestamptz not null default now()
);

create index if not exists claim_evidence_claim_idx
  on public.claim_evidence (claim_id, source_rank nulls last);
create index if not exists claim_evidence_domain_idx
  on public.claim_evidence (domain);
create index if not exists claim_evidence_stance_idx
  on public.claim_evidence (stance);

alter table public.verification_cases enable row level security;
alter table public.verification_claims enable row level security;
alter table public.claim_evidence enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'verification_cases'
      and policyname = 'verification_cases_self_select'
  ) then
    create policy verification_cases_self_select on public.verification_cases
      for select using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'verification_claims'
      and policyname = 'verification_claims_self_insert'
  ) then
    create policy verification_claims_self_insert on public.verification_claims
      for insert with check (
        exists (
          select 1 from public.verification_cases c
          where c.id = verification_claims.case_id and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'verification_cases'
      and policyname = 'verification_cases_self_insert'
  ) then
    create policy verification_cases_self_insert on public.verification_cases
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'verification_claims'
      and policyname = 'verification_claims_self_select'
  ) then
    create policy verification_claims_self_select on public.verification_claims
      for select using (
        exists (
          select 1 from public.verification_cases c
          where c.id = verification_claims.case_id and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'verification_claims'
      and policyname = 'verification_claims_self_insert'
  ) then
    create policy verification_claims_self_insert on public.verification_claims
      for insert with check (
        exists (
          select 1 from public.verification_cases c
          where c.id = verification_claims.case_id and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'claim_evidence'
      and policyname = 'claim_evidence_self_select'
  ) then
    create policy claim_evidence_self_select on public.claim_evidence
      for select using (
        exists (
          select 1
          from public.verification_claims vc
          join public.verification_cases c on c.id = vc.case_id
          where vc.id = claim_evidence.claim_id and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'claim_evidence'
      and policyname = 'claim_evidence_self_insert'
  ) then
    create policy claim_evidence_self_insert on public.claim_evidence
      for insert with check (
        exists (
          select 1
          from public.verification_claims vc
          join public.verification_cases c on c.id = vc.case_id
          where vc.id = claim_evidence.claim_id and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'claim_evidence'
      and policyname = 'claim_evidence_self_insert'
  ) then
    create policy claim_evidence_self_insert on public.claim_evidence
      for insert with check (
        exists (
          select 1
          from public.verification_claims vc
          join public.verification_cases c on c.id = vc.case_id
          where vc.id = claim_evidence.claim_id and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

grant select, insert, update on public.verification_cases to service_role;
grant select, insert on public.verification_claims to service_role;
grant select, insert on public.claim_evidence to service_role;
