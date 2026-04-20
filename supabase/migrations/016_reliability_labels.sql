-- Phase 3 — user-facing reliability label contract.
--
-- `reliability_score` already exists from migration 015 (as smallint, which
-- holds any integer 0–100); we keep it and add two companion columns that
-- describe the same number in human terms:
--   reliability_label   — a short, machine-stable tag for the UI/API
--   reliability_summary — a one-sentence description produced deterministically
--
-- Both are nullable; rows ingested before this migration will simply have
-- NULL values until the next ingest cycle touches them.

alter table public.signals
  add column if not exists reliability_label text,
  add column if not exists reliability_summary text;

-- Enforce the label enum. Wrapped in a DO block so re-running this migration
-- after a partial success doesn't fail on an existing constraint.
do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name = 'signals_reliability_label_check'
  ) then
    alter table public.signals
      add constraint signals_reliability_label_check
      check (
        reliability_label is null
        or reliability_label in ('LIKELY_ACCURATE','UNCLEAR','LIKELY_UNRELIABLE')
      );
  end if;
end $$;

create index if not exists signals_reliability_label_idx
  on public.signals (reliability_label);

-- Keep the anon-readable view in sync. `create or replace view` only permits
-- APPENDING new columns — the two new fields are added at the very end of
-- the column list, after the Phase 2 reliability columns that we appended
-- in migration 015.
create or replace view public.signals_public as
  select
    s.id, s.title, s.summary, s.url, s.source_id, s.topic, s.country_code,
    s.severity, s.confidence, s.verification_status, s.source_count,
    s.credible_source_count, s.distinct_domains, s.tags,
    s.occurred_at, s.first_seen_at, s.last_seen_at,
    s.reliability_score, s.agreement_score, s.source_independence_score,
    s.narrative_divergence_score, s.evidence_strength_score,
    s.reliability_label, s.reliability_summary
  from public.signals s
  where s.verification_status in ('verified','developing','unverified')
    and (s.expires_at is null or s.expires_at > now());

grant select on public.signals_public to anon, authenticated;
