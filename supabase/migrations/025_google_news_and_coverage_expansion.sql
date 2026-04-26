-- ============================================================================
-- 025 — Google News topic feeds + additional high-volume sources.
--
-- Google News RSS aggregates from thousands of publishers per topic, free,
-- no API key. This is the single biggest coverage expansion — each feed
-- returns ~30-60 stories spanning dozens of outlets.
--
-- Credibility: Google News is an aggregator, not a source. We give it
-- moderate credibility (55) — it surfaces stories, but the individual
-- articles it links to are what matter for corroboration. The clustering
-- layer will match Google News items against direct-source RSS feeds,
-- boosting signals that appear in both.
-- ============================================================================

insert into public.sources (id, name, kind, url, credibility, metadata) values

  -- ═══════════════════════════════════════════════════════════════════════
  -- GOOGLE NEWS — topic aggregation feeds (free, no API key)
  -- ═══════════════════════════════════════════════════════════════════════
  ('gnews-top',
   'Google News · Top Stories',
   'rss', 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
   55, '{"domain":"news.google.com","type":"aggregator","topic_hint":"general"}'::jsonb),

  ('gnews-world',
   'Google News · World',
   'rss', 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',
   55, '{"domain":"news.google.com","type":"aggregator","topic_hint":"general"}'::jsonb),

  ('gnews-business',
   'Google News · Business',
   'rss', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en',
   55, '{"domain":"news.google.com","type":"aggregator","topic_hint":"economy"}'::jsonb),

  ('gnews-technology',
   'Google News · Technology',
   'rss', 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en',
   55, '{"domain":"news.google.com","type":"aggregator","topic_hint":"tech"}'::jsonb),

  ('gnews-science',
   'Google News · Science',
   'rss', 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-US&gl=US&ceid=US:en',
   55, '{"domain":"news.google.com","type":"aggregator","topic_hint":"climate"}'::jsonb),

  ('gnews-health',
   'Google News · Health',
   'rss', 'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en-US&gl=US&ceid=US:en',
   55, '{"domain":"news.google.com","type":"aggregator","topic_hint":"health"}'::jsonb),

  ('gnews-nation',
   'Google News · US',
   'rss', 'https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en',
   55, '{"domain":"news.google.com","type":"aggregator","topic_hint":"civil"}'::jsonb),

  -- UK edition for international diversity
  ('gnews-uk',
   'Google News · UK',
   'rss', 'https://news.google.com/rss?hl=en-GB&gl=GB&ceid=GB:en',
   55, '{"domain":"news.google.com","type":"aggregator","topic_hint":"general","region":"europe"}'::jsonb),

  -- ═══════════════════════════════════════════════════════════════════════
  -- HIGH-VOLUME GENERAL NEWS (missing from existing catalog)
  -- ═══════════════════════════════════════════════════════════════════════
  ('politico-top',
   'Politico',
   'rss', 'https://rss.politico.com/politics-news.xml',
   72, '{"domain":"politico.com","type":"politics"}'::jsonb),

  ('thehill-top',
   'The Hill',
   'rss', 'https://thehill.com/feed/',
   68, '{"domain":"thehill.com","type":"politics"}'::jsonb),

  ('axios-top',
   'Axios',
   'rss', 'https://api.axios.com/feed/',
   70, '{"domain":"axios.com","type":"general"}'::jsonb),

  ('propublica',
   'ProPublica',
   'rss', 'https://feeds.propublica.org/propublica/main',
   78, '{"domain":"propublica.org","type":"investigative"}'::jsonb),

  ('intercept',
   'The Intercept',
   'rss', 'https://theintercept.com/feed/?rss',
   65, '{"domain":"theintercept.com","type":"investigative"}'::jsonb),

  ('pbs-newshour',
   'PBS NewsHour',
   'rss', 'https://www.pbs.org/newshour/feeds/rss/headlines',
   76, '{"domain":"pbs.org","type":"broadcast"}'::jsonb),

  ('bbc-us',
   'BBC · US & Canada',
   'rss', 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
   80, '{"domain":"bbc.co.uk","type":"news_regional","region":"north_america"}'::jsonb),

  ('guardian-us',
   'The Guardian · US',
   'rss', 'https://www.theguardian.com/us-news/rss',
   78, '{"domain":"theguardian.com","type":"news_regional","region":"north_america"}'::jsonb),

  -- ═══════════════════════════════════════════════════════════════════════
  -- HEALTH (weak topic coverage)
  -- ═══════════════════════════════════════════════════════════════════════
  ('who-news',
   'WHO · News',
   'rss', 'https://www.who.int/feeds/entity/mediacentre/news/en/rss.xml',
   88, '{"domain":"who.int","type":"health","official":true}'::jsonb),

  ('cdc-newsroom',
   'CDC · Newsroom',
   'rss', 'https://tools.cdc.gov/api/v2/resources/media/316422.rss',
   90, '{"domain":"cdc.gov","type":"health","official":true}'::jsonb),

  ('statnews',
   'STAT News',
   'rss', 'https://www.statnews.com/feed/',
   72, '{"domain":"statnews.com","type":"health"}'::jsonb),

  ('medscape',
   'Medscape · Top Stories',
   'rss', 'https://www.medscape.com/cx/rssfeeds/2301.xml',
   68, '{"domain":"medscape.com","type":"health"}'::jsonb),

  -- ═══════════════════════════════════════════════════════════════════════
  -- CLIMATE / ENVIRONMENT (expanded)
  -- ═══════════════════════════════════════════════════════════════════════
  ('carbon-brief',
   'Carbon Brief',
   'rss', 'https://www.carbonbrief.org/feed/',
   74, '{"domain":"carbonbrief.org","type":"climate"}'::jsonb),

  ('climate-home',
   'Climate Home News',
   'rss', 'https://www.climatechangenews.com/feed/',
   68, '{"domain":"climatechangenews.com","type":"climate"}'::jsonb),

  ('guardian-environment',
   'The Guardian · Environment',
   'rss', 'https://www.theguardian.com/environment/rss',
   78, '{"domain":"theguardian.com","type":"climate"}'::jsonb),

  -- ═══════════════════════════════════════════════════════════════════════
  -- MISSING REGIONS (Latin America, Southeast Asia, East Africa)
  -- ═══════════════════════════════════════════════════════════════════════
  ('bbc-africa',
   'BBC · Africa',
   'rss', 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
   80, '{"domain":"bbc.co.uk","type":"news_regional","region":"africa"}'::jsonb),

  ('bbc-asia',
   'BBC · Asia',
   'rss', 'https://feeds.bbci.co.uk/news/world/asia/rss.xml',
   80, '{"domain":"bbc.co.uk","type":"news_regional","region":"asia_pacific"}'::jsonb),

  ('bbc-latam',
   'BBC · Latin America',
   'rss', 'https://feeds.bbci.co.uk/news/world/latin_america/rss.xml',
   80, '{"domain":"bbc.co.uk","type":"news_regional","region":"americas"}'::jsonb),

  ('bbc-middle-east',
   'BBC · Middle East',
   'rss', 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
   80, '{"domain":"bbc.co.uk","type":"news_regional","region":"middle_east"}'::jsonb),

  ('bbc-europe',
   'BBC · Europe',
   'rss', 'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
   80, '{"domain":"bbc.co.uk","type":"news_regional","region":"europe"}'::jsonb),

  ('reuters-europe',
   'Reuters · Europe',
   'rss', 'https://www.reuters.com/world/europe/rss',
   85, '{"domain":"reuters.com","type":"news_regional","region":"europe"}'::jsonb),

  ('reuters-africa',
   'Reuters · Africa',
   'rss', 'https://www.reuters.com/world/africa/rss',
   85, '{"domain":"reuters.com","type":"news_regional","region":"africa"}'::jsonb),

  ('reuters-asia',
   'Reuters · Asia-Pacific',
   'rss', 'https://www.reuters.com/world/asia-pacific/rss',
   85, '{"domain":"reuters.com","type":"news_regional","region":"asia_pacific"}'::jsonb),

  ('reuters-middle-east',
   'Reuters · Middle East',
   'rss', 'https://www.reuters.com/world/middle-east/rss',
   85, '{"domain":"reuters.com","type":"news_regional","region":"middle_east"}'::jsonb)

on conflict (id) do update set
  name        = excluded.name,
  kind        = excluded.kind,
  url         = excluded.url,
  credibility = excluded.credibility,
  metadata    = excluded.metadata;
