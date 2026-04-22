-- ============================================================================
-- 023 — Expose last_enriched_at via the public signals view.
--
-- Migration 022 added `signals.last_enriched_at` to the base table so the
-- develop-story enrichment worker could track cooldowns. But the anon-readable
-- `signals_public` view (defined in migration 016) was NOT updated to expose
-- it. As a result:
--
--   • `apps/web/app/feed/page.tsx` / `dashboard/page.tsx` / `briefings/page.tsx`
--     all query `signals_public` and get `last_enriched_at = undefined` on
--     each row, so the "freshly corroborated" badge never renders.
--
--   • Any signal-detail page that falls back from the `signals` table query
--     to the public view loses the column entirely.
--
-- This migration re-creates the view with `last_enriched_at` appended at the
-- end of the column list (since `create or replace view` only permits
-- APPENDING columns, same constraint migration 016 already honours).
-- ============================================================================

create or replace view public.signals_public as
  select
    s.id, s.title, s.summary, s.url, s.source_id, s.topic, s.country_code,
    s.severity, s.confidence, s.verification_status, s.source_count,
    s.credible_source_count, s.distinct_domains, s.tags,
    s.occurred_at, s.first_seen_at, s.last_seen_at,
    s.reliability_score, s.agreement_score, s.source_independence_score,
    s.narrative_divergence_score, s.evidence_strength_score,
    s.reliability_label, s.reliability_summary,
    s.last_enriched_at
  from public.signals s
  where s.verification_status in ('verified','developing','unverified')
    and (s.expires_at is null or s.expires_at > now());

grant select on public.signals_public to anon, authenticated;
