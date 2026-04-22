-- ============================================================================
-- 020 — Phase 4: Free-Tier Social Source Expansion (Tier B).
--
-- Register Reddit / Bluesky / Mastodon as first-class sources so they flow
-- through the existing `loadAdapters()` registry. The worker is already
-- wired (adapters/index.ts); enabling a row here is sufficient to turn
-- them on in production.
--
-- Credibility posture:
--   • All three social sources are given LOW credibility scores on
--     purpose. They must NEVER cross the dynamic-credible-domains
--     threshold in `registerDynamicCredibleDomains` (currently 60).
--   • Their host domains are also intentionally absent from
--     `packages/core/src/domains.ts`'s CREDIBLE list.
--   • Net effect: social evidence corroborates context but can never
--     anchor a `HIGH` confidence band on its own.
--
-- Diversity metadata: `ecosystem` lets ranking code downgrade a signal
-- when 100% of its evidence comes from one ecosystem (see future
-- verification ranker wiring).
--
-- Backfill: additive. Zero existing rows to migrate.
-- ============================================================================

insert into public.sources (id, name, kind, url, credibility, enabled, metadata) values
  ('reddit-public',
   'Reddit · public hot',
   'api',
   'https://www.reddit.com/r/worldnews+news+breakingnews/hot.json',
   25,
   true,
   '{"domain":"reddit.com","type":"social","platform":"reddit","ecosystem":"reddit","tier":"B","free_tier":true}'::jsonb),
  ('bluesky-public',
   'Bluesky · public search',
   'api',
   'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts',
   25,
   true,
   '{"domain":"bsky.app","type":"social","platform":"bluesky","ecosystem":"bluesky","tier":"B","free_tier":true}'::jsonb),
  ('mastodon-public',
   'Mastodon · public timelines',
   'api',
   'https://mastodon.social/api/v1/timelines/public',
   25,
   true,
   '{"domain":"mastodon.social","type":"social","platform":"mastodon","ecosystem":"mastodon","tier":"B","free_tier":true}'::jsonb)
on conflict (id) do update set
  name        = excluded.name,
  kind        = excluded.kind,
  url         = excluded.url,
  credibility = excluded.credibility,
  enabled     = excluded.enabled,
  metadata    = excluded.metadata;
