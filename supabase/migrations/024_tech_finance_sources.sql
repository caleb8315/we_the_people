-- ============================================================================
-- 024 — Tech & Finance source expansion.
--
-- Adds dedicated RSS feeds for the new `tech` and `finance` topics so the
-- clustering layer has real signal flow for both categories. All feeds are
-- free/public RSS with no API keys required.
--
-- Credibility scores follow the same posture as existing sources:
--   70+  = treated as credible by the corroboration engine
--   50-69 = neutral; corroborates but doesn't anchor HIGH confidence
--   <50  = low-trust / opinion / blog-tier
-- ============================================================================

insert into public.sources (id, name, kind, url, credibility, metadata) values

  -- ═══════════════════════════════════════════════════════════════════════
  -- TECH — major technology outlets
  -- ═══════════════════════════════════════════════════════════════════════
  ('techcrunch',
   'TechCrunch',
   'rss', 'https://techcrunch.com/feed/',
   70, '{"domain":"techcrunch.com","type":"tech"}'::jsonb),

  ('verge',
   'The Verge',
   'rss', 'https://www.theverge.com/rss/index.xml',
   72, '{"domain":"theverge.com","type":"tech"}'::jsonb),

  ('arstechnica',
   'Ars Technica',
   'rss', 'https://feeds.arstechnica.com/arstechnica/index',
   74, '{"domain":"arstechnica.com","type":"tech"}'::jsonb),

  ('wired',
   'Wired',
   'rss', 'https://www.wired.com/feed/rss',
   72, '{"domain":"wired.com","type":"tech"}'::jsonb),

  ('engadget',
   'Engadget',
   'rss', 'https://www.engadget.com/rss.xml',
   65, '{"domain":"engadget.com","type":"tech"}'::jsonb),

  ('zdnet',
   'ZDNet',
   'rss', 'https://www.zdnet.com/news/rss.xml',
   68, '{"domain":"zdnet.com","type":"tech"}'::jsonb),

  ('techradar',
   'TechRadar',
   'rss', 'https://www.techradar.com/rss',
   62, '{"domain":"techradar.com","type":"tech"}'::jsonb),

  ('thenextweb',
   'The Next Web',
   'rss', 'https://thenextweb.com/feed/',
   60, '{"domain":"thenextweb.com","type":"tech"}'::jsonb),

  ('mit-tech-review',
   'MIT Technology Review',
   'rss', 'https://www.technologyreview.com/feed/',
   78, '{"domain":"technologyreview.com","type":"tech"}'::jsonb),

  ('venturebeat',
   'VentureBeat',
   'rss', 'https://venturebeat.com/feed/',
   64, '{"domain":"venturebeat.com","type":"tech"}'::jsonb),

  ('9to5mac',
   '9to5Mac',
   'rss', 'https://9to5mac.com/feed/',
   60, '{"domain":"9to5mac.com","type":"tech"}'::jsonb),

  ('9to5google',
   '9to5Google',
   'rss', 'https://9to5google.com/feed/',
   60, '{"domain":"9to5google.com","type":"tech"}'::jsonb),

  ('macrumors',
   'MacRumors',
   'rss', 'https://feeds.macrumors.com/MacRumors-All',
   58, '{"domain":"macrumors.com","type":"tech"}'::jsonb),

  ('tomshardware',
   'Tom''s Hardware',
   'rss', 'https://www.tomshardware.com/feeds/all',
   62, '{"domain":"tomshardware.com","type":"tech"}'::jsonb),

  ('semafor-tech',
   'Semafor · Tech',
   'rss', 'https://www.semafor.com/vertical/tech/rss',
   66, '{"domain":"semafor.com","type":"tech"}'::jsonb),

  ('restofworld',
   'Rest of World',
   'rss', 'https://restofworld.org/feed/',
   68, '{"domain":"restofworld.org","type":"tech"}'::jsonb),

  -- AI-specific
  ('openai-blog',
   'OpenAI Blog',
   'rss', 'https://openai.com/blog/rss.xml',
   72, '{"domain":"openai.com","type":"tech"}'::jsonb),

  ('ai-news-mit',
   'MIT News · AI',
   'rss', 'https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml',
   80, '{"domain":"mit.edu","type":"tech"}'::jsonb),

  -- ═══════════════════════════════════════════════════════════════════════
  -- FINANCE — markets, banking, economics, crypto
  -- ═══════════════════════════════════════════════════════════════════════
  ('reuters-business',
   'Reuters · Business',
   'rss', 'https://www.reuters.com/business/rss',
   85, '{"domain":"reuters.com","type":"finance"}'::jsonb),

  ('bloomberg-markets',
   'Bloomberg · Markets',
   'rss', 'https://feeds.bloomberg.com/markets/news.rss',
   80, '{"domain":"bloomberg.com","type":"finance"}'::jsonb),

  ('ft-world',
   'Financial Times · World',
   'rss', 'https://www.ft.com/rss/home/uk',
   82, '{"domain":"ft.com","type":"finance"}'::jsonb),

  ('wsj-markets',
   'Wall Street Journal · Markets',
   'rss', 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
   80, '{"domain":"wsj.com","type":"finance"}'::jsonb),

  ('cnbc-top',
   'CNBC · Top News',
   'rss', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
   72, '{"domain":"cnbc.com","type":"finance"}'::jsonb),

  ('marketwatch',
   'MarketWatch',
   'rss', 'https://feeds.marketwatch.com/marketwatch/topstories/',
   68, '{"domain":"marketwatch.com","type":"finance"}'::jsonb),

  ('investopedia',
   'Investopedia',
   'rss', 'https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_headline',
   60, '{"domain":"investopedia.com","type":"finance"}'::jsonb),

  ('seekingalpha',
   'Seeking Alpha · Market News',
   'rss', 'https://seekingalpha.com/market_currents.xml',
   55, '{"domain":"seekingalpha.com","type":"finance"}'::jsonb),

  ('coindesk',
   'CoinDesk',
   'rss', 'https://www.coindesk.com/arc/outboundfeeds/rss/',
   62, '{"domain":"coindesk.com","type":"finance"}'::jsonb),

  ('theblock',
   'The Block',
   'rss', 'https://www.theblock.co/rss.xml',
   60, '{"domain":"theblock.co","type":"finance"}'::jsonb),

  ('federalreserve',
   'Federal Reserve · Press Releases',
   'rss', 'https://www.federalreserve.gov/feeds/press_all.xml',
   92, '{"domain":"federalreserve.gov","type":"finance","official":true}'::jsonb),

  ('ecb-press',
   'ECB · Press Releases',
   'rss', 'https://www.ecb.europa.eu/rss/press.html',
   90, '{"domain":"ecb.europa.eu","type":"finance","official":true}'::jsonb),

  ('imf-news',
   'IMF · News',
   'rss', 'https://www.imf.org/en/News/rss',
   88, '{"domain":"imf.org","type":"finance","official":true}'::jsonb),

  ('worldbank-news',
   'World Bank · News',
   'rss', 'https://www.worldbank.org/en/news/all/rss.xml',
   86, '{"domain":"worldbank.org","type":"finance","official":true}'::jsonb),

  ('sec-press',
   'SEC · Press Releases',
   'rss', 'https://www.sec.gov/news/pressreleases.rss',
   90, '{"domain":"sec.gov","type":"finance","official":true}'::jsonb),

  ('bls-news',
   'Bureau of Labor Statistics · News',
   'rss', 'https://www.bls.gov/feed/bls_latest.rss',
   90, '{"domain":"bls.gov","type":"finance","official":true}'::jsonb),

  ('semafor-biz',
   'Semafor · Business',
   'rss', 'https://www.semafor.com/vertical/business/rss',
   66, '{"domain":"semafor.com","type":"finance"}'::jsonb),

  ('nyt-business',
   'NYT · Business',
   'rss', 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
   76, '{"domain":"nytimes.com","type":"finance"}'::jsonb),

  ('reuters-markets',
   'Reuters · Markets',
   'rss', 'https://www.reuters.com/markets/rss',
   85, '{"domain":"reuters.com","type":"finance"}'::jsonb),

  ('nyt-tech',
   'NYT · Technology',
   'rss', 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
   76, '{"domain":"nytimes.com","type":"tech"}'::jsonb),

  ('bbc-tech',
   'BBC · Technology',
   'rss', 'https://feeds.bbci.co.uk/news/technology/rss.xml',
   80, '{"domain":"bbc.co.uk","type":"tech"}'::jsonb),

  ('guardian-tech',
   'The Guardian · Technology',
   'rss', 'https://www.theguardian.com/technology/rss',
   78, '{"domain":"theguardian.com","type":"tech"}'::jsonb),

  ('reuters-tech',
   'Reuters · Technology',
   'rss', 'https://www.reuters.com/technology/rss',
   85, '{"domain":"reuters.com","type":"tech"}'::jsonb)

on conflict (id) do update set
  name        = excluded.name,
  kind        = excluded.kind,
  url         = excluded.url,
  credibility = excluded.credibility,
  metadata    = excluded.metadata;
