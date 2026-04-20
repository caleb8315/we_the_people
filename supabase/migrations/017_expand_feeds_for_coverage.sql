-- ============================================================================
-- Expand RSS coverage for better multi-source corroboration.
-- Adds high-volume news outlets + Middle East / conflict-heavy feeds so
-- that the clustering layer can merge more articles per event.
-- ============================================================================

insert into public.sources (id, name, kind, url, credibility, metadata) values
  -- Wire services & major outlets not yet covered
  ('afp-en',            'AFP · English',             'rss', 'https://www.france24.com/en/europe/rss',                         78, '{"domain":"france24.com","type":"wire"}'::jsonb),
  ('independent-world', 'The Independent · World',   'rss', 'https://www.independent.co.uk/news/world/rss',                   66, '{"domain":"independent.co.uk","type":"news_regional","region":"global"}'::jsonb),
  ('euronews-world',    'Euronews · World',          'rss', 'https://www.euronews.com/rss?level=theme&name=news',             66, '{"domain":"euronews.com","type":"news_regional","region":"europe"}'::jsonb),
  ('abc-news-us',       'ABC News · International',  'rss', 'https://abcnews.go.com/abcnews/internationalheadlines',         68, '{"domain":"abcnews.go.com","type":"news_regional","region":"north_america"}'::jsonb),
  ('nbc-world',         'NBC News · World',          'rss', 'https://feeds.nbcnews.com/nbcnews/public/world',                 68, '{"domain":"nbcnews.com","type":"news_regional","region":"north_america"}'::jsonb),
  ('fox-world',         'Fox News · World',          'rss', 'http://feeds.foxnews.com/foxnews/world',                         55, '{"domain":"foxnews.com","type":"news_regional","region":"north_america"}'::jsonb),
  ('rt-news',           'RT · World',                'rss', 'https://www.rt.com/rss/news/',                                   40, '{"domain":"rt.com","type":"news_regional","region":"global"}'::jsonb),
  -- Middle East & conflict-heavy
  ('middleeasteye',     'Middle East Eye',           'rss', 'https://www.middleeasteye.net/rss',                               60, '{"domain":"middleeasteye.net","type":"news_regional","region":"middle_east"}'::jsonb),
  ('trt-world',         'TRT World',                 'rss', 'https://www.trtworld.com/rss',                                    55, '{"domain":"trtworld.com","type":"news_regional","region":"middle_east"}'::jsonb),
  ('arab-news',         'Arab News',                 'rss', 'https://www.arabnews.com/rss.xml',                                58, '{"domain":"arabnews.com","type":"news_regional","region":"middle_east"}'::jsonb),
  -- Asia-Pacific
  ('scmp-world',        'South China Morning Post',  'rss', 'https://www.scmp.com/rss/91/feed',                                64, '{"domain":"scmp.com","type":"news_regional","region":"asia_pacific"}'::jsonb),
  ('nikkei-asia',       'Nikkei Asia',               'rss', 'https://asia.nikkei.com/rss',                                     66, '{"domain":"asia.nikkei.com","type":"news_regional","region":"asia_pacific"}'::jsonb),
  -- Latin America
  ('reuters-americas',  'Reuters · Americas',        'rss', 'https://www.reuters.com/world/americas/rss',                     85, '{"domain":"reuters.com","type":"news_regional","region":"americas"}'::jsonb),
  -- Defense / security
  ('defense-one',       'Defense One',               'rss', 'https://www.defenseone.com/rss/',                                 64, '{"domain":"defenseone.com","type":"defense"}'::jsonb),
  ('war-on-rocks',      'War on the Rocks',          'rss', 'https://warontherocks.com/feed/',                                 66, '{"domain":"warontherocks.com","type":"defense"}'::jsonb)
on conflict (id) do update set
  name        = excluded.name,
  kind        = excluded.kind,
  url         = excluded.url,
  credibility = excluded.credibility,
  metadata    = excluded.metadata;
