-- Phase 2 reliability dimensions. We AUGMENT `public.signals`; we do NOT
-- remove or touch `severity`, `confidence`, or `verification_status`.
-- Every new column is nullable with no default, so existing rows remain
-- valid and the new pipeline backfills the values on the next ingest run.

alter table public.signals
  add column if not exists reliability_score            smallint
    check (reliability_score is null or (reliability_score between 0 and 100)),
  add column if not exists agreement_score              smallint
    check (agreement_score is null or (agreement_score between 0 and 100)),
  add column if not exists source_independence_score    smallint
    check (source_independence_score is null or (source_independence_score between 0 and 100)),
  add column if not exists narrative_divergence_score   smallint
    check (narrative_divergence_score is null or (narrative_divergence_score between 0 and 100)),
  add column if not exists evidence_strength_score      smallint
    check (evidence_strength_score is null or (evidence_strength_score between 0 and 100));

create index if not exists signals_reliability_idx
  on public.signals (reliability_score desc nulls last);

-- Keep the anon-readable view in sync with the new columns so the feed,
-- dashboard, and signal detail page can surface the reliability breakdown
-- without switching to service-role reads.
--
-- Important: Postgres `create or replace view` only allows APPENDING new
-- columns, never reordering or renaming existing ones. The original view
-- (migration 001) ends with `s.occurred_at, s.first_seen_at, s.last_seen_at`,
-- so the five new reliability columns MUST be appended after those three.
create or replace view public.signals_public as
  select
    s.id, s.title, s.summary, s.url, s.source_id, s.topic, s.country_code,
    s.severity, s.confidence, s.verification_status, s.source_count,
    s.credible_source_count, s.distinct_domains, s.tags,
    s.occurred_at, s.first_seen_at, s.last_seen_at,
    s.reliability_score, s.agreement_score, s.source_independence_score,
    s.narrative_divergence_score, s.evidence_strength_score
  from public.signals s
  where s.verification_status in ('verified','developing','unverified')
    and (s.expires_at is null or s.expires_at > now());

grant select on public.signals_public to anon, authenticated;
