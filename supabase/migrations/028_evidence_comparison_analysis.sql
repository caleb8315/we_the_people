-- ============================================================================
-- 028 — Persist the evidence-comparison analysis on `public.signals` and
-- `public.verifications`.
--
-- Context (April 2026 evidence-comparison upgrade):
--   PR #17 introduced six new pure analysis modules in `@osint/core`:
--
--     - source-ranking          ranks sources by credibility / directness /
--                               recency / independence with rationale
--     - conflict-analysis       extends the conflict taxonomy with
--                               framing / timeline / missing-context /
--                               insufficient-evidence and adds numeric
--                               severity_score
--     - bias                    detects loaded language, one-sided framing,
--                               selective omission, emotional tone — strictly
--                               as a SIGNAL, never folded into confidence
--     - evidence-cards          per-source cards with stance + explanation
--     - confidence-breakdown    decomposes confidence into 4 components +
--                               an explicit penalty list
--     - result-explanation      Why this result? / What would resolve this? /
--                               agree / disagree
--
--   Those modules were wired into `/api/verify` only in PR #17, computed at
--   request time. To make the feed, signal pages, briefings, and alerts
--   "smarter too" without paying that compute cost on every render, we
--   persist the result of those modules onto the parent signal row at
--   ingest time, and onto `verifications` at verify time.
--
-- Design rules (mirror the existing reliability migrations 015 / 016):
--   - All new columns are NULLABLE with no default. Existing rows stay
--     valid. The decorate path falls back to computing on the fly when
--     persisted analysis is absent (e.g. signals ingested before this
--     migration ran, or before the worker was redeployed).
--   - We use JSONB so the shape can evolve without a follow-up migration.
--     `analysis_version` lets the worker tag what schema the row was
--     written under — older rows can be lazily recomputed by the
--     develop-story endpoint.
--   - The DB-locked `contradictions` contract from migration 014 is
--     UNCHANGED. The new `analyzed_conflicts` JSONB carries the broader
--     reader-facing taxonomy; the row-level contradictions table keeps
--     producing the persisted, type-checked rows for backwards compat.
--   - The anon-readable `signals_public` view is updated to expose the
--     new columns so the feed surfaces can read them under RLS without
--     elevating to service role.
-- ============================================================================

-- 1. Per-signal analysis columns ─────────────────────────────────────────────
alter table public.signals
  add column if not exists ranked_sources jsonb,
  add column if not exists analyzed_conflicts jsonb,
  add column if not exists bias_report jsonb,
  add column if not exists evidence_cards jsonb,
  add column if not exists confidence_breakdown jsonb,
  add column if not exists result_explanation jsonb,
  add column if not exists analysis_version smallint;

comment on column public.signals.ranked_sources is
  'Ordered list of RankedSource (source-ranking module). Each entry carries score, components (credibility/directness/recency/independence), and per-source reasons.';
comment on column public.signals.analyzed_conflicts is
  'Ordered list of AnalyzedConflict (conflict-analysis module). Extends the row-level contradictions table with framing/timeline/missing-context/insufficient-evidence + numeric severity_score.';
comment on column public.signals.bias_report is
  'CorpusBiasReport (bias module). Always rendered as a SIGNAL, never as a verdict — the disclaimer text is required output and the overall_intensity must NOT feed back into the confidence engine.';
comment on column public.signals.evidence_cards is
  'Ordered list of EvidenceCard (evidence-cards module). One per evidence row with stance (supports / disputes / context / neutral) and a short explanation.';
comment on column public.signals.confidence_breakdown is
  'ConfidenceBreakdown (confidence-breakdown module). 4 components — source_agreement, source_quality, claim_directness, evidence_completeness — plus penalty list.';
comment on column public.signals.result_explanation is
  'ResultExplanation (result-explanation module). Plain-English Why this result? / What would resolve this? / agree / disagree sections.';
comment on column public.signals.analysis_version is
  'Schema tag for the analysis JSONB blobs. Bumped on every analysis-shape migration so older rows can be lazily recomputed.';

-- A small partial index helps the develop-story / backfill paths find
-- signals that don't yet have analysis attached without a full sequential
-- scan over `signals`. We do NOT index by `analysis_version` itself
-- because the existence of the column on a row is what gates recomputation.
create index if not exists signals_missing_analysis_idx
  on public.signals (last_seen_at desc nulls last)
  where analysis_version is null;

-- 2. Refresh signals_public ─────────────────────────────────────────────────
-- `create or replace view` only allows APPENDING columns. We append the
-- seven new fields after the columns added in migration 023.
create or replace view public.signals_public as
  select
    s.id, s.title, s.summary, s.url, s.source_id, s.topic, s.country_code,
    s.severity, s.confidence, s.verification_status, s.source_count,
    s.credible_source_count, s.distinct_domains, s.tags,
    s.occurred_at, s.first_seen_at, s.last_seen_at,
    s.reliability_score, s.agreement_score, s.source_independence_score,
    s.narrative_divergence_score, s.evidence_strength_score,
    s.reliability_label, s.reliability_summary,
    s.last_enriched_at,
    s.ranked_sources, s.analyzed_conflicts, s.bias_report,
    s.evidence_cards, s.confidence_breakdown, s.result_explanation,
    s.analysis_version
  from public.signals s
  where s.verification_status in ('verified','developing','unverified')
    and (s.expires_at is null or s.expires_at > now());

grant select on public.signals_public to anon, authenticated;

-- 3. Per-verification analysis blob ─────────────────────────────────────────
-- `verifications` already stores the legacy `confidence_report`. We add a
-- single `analysis` JSONB column so historical verifications can be
-- re-rendered with the upgraded panel without re-running the live
-- corroboration fan-out.
alter table public.verifications
  add column if not exists analysis jsonb,
  add column if not exists analysis_version smallint;

comment on column public.verifications.analysis is
  'Full evidence-comparison analysis as returned by POST /api/verify. Contains ranked_sources, analyzed_conflicts, bias_report, evidence_cards, confidence_breakdown, and result_explanation.';
comment on column public.verifications.analysis_version is
  'Schema tag for the analysis JSONB blob — same versioning scheme as signals.analysis_version.';
