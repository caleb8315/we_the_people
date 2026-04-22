-- ============================================================================
-- 022 — Live story-development enrichment.
--
-- Adds the two columns needed to run the verify-route's live corroboration
-- fan-out (web search + Reddit + Bluesky + Wikipedia + GDELT + sensors +
-- tracked events) against *existing* signals in the feed, not just new
-- submissions. This lets the feed/signal detail surfaces "develop the
-- story" over time, pulling in fresh sources the ingest adapters haven't
-- caught yet.
--
--   • signals.last_enriched_at — when we last ran the live fan-out for this
--     signal. The cron worker and the on-demand UI button both honour a
--     cooldown (default 5 min) against this column so a hot signal can't
--     spam GDELT/Firecrawl.
--
--   • evidence.discovered_via — which system surfaced this evidence row.
--     `ingest` (default) covers everything the periodic ingest adapters
--     pull in. `live_*` tags identify rows that showed up via the live
--     corroboration fan-out so the UI can badge them "found while you were
--     reading" without changing the evidence contract.
--
-- Both columns are nullable / default-bearing so existing rows don't need
-- a backfill.
-- ============================================================================

alter table public.signals
  add column if not exists last_enriched_at timestamptz;

create index if not exists signals_last_enriched_idx
  on public.signals (last_enriched_at);

alter table public.evidence
  add column if not exists discovered_via text;

-- Intentional loose constraint: we treat this as informational, not a
-- foreign key. The `live_*` tag set mirrors the SourceId enum in
-- apps/web/lib/live-sources/types.ts — keep it in sync by convention,
-- but do not reject unknown values at the DB layer (forward-compat with
-- future source additions).
create index if not exists evidence_discovered_via_idx
  on public.evidence (discovered_via);
