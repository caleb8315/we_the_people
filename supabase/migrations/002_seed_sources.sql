-- ============================================================================
-- Seed: default trusted sources (RSS-first, public APIs only)
-- All sources here are public/open. Users can toggle any off in Settings.
-- ============================================================================

insert into public.sources (id, name, kind, url, credibility, metadata) values
  ('reuters-world',   'Reuters · World',         'rss', 'https://www.reuters.com/world/rss',                      85, '{"domain":"reuters.com"}'::jsonb),
  ('apnews-top',      'AP News · Top',           'rss', 'https://apnews.com/index.rss',                           85, '{"domain":"apnews.com"}'::jsonb),
  ('bbc-world',       'BBC · World',             'rss', 'https://feeds.bbci.co.uk/news/world/rss.xml',            80, '{"domain":"bbc.co.uk"}'::jsonb),
  ('guardian-world',  'The Guardian · World',    'rss', 'https://www.theguardian.com/world/rss',                  78, '{"domain":"theguardian.com"}'::jsonb),
  ('cnn-world',       'CNN · World',             'rss', 'http://rss.cnn.com/rss/edition_world.rss',               70, '{"domain":"cnn.com"}'::jsonb),
  ('nyt-world',       'NYT · World',             'rss', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 76, '{"domain":"nytimes.com"}'::jsonb),
  ('washpost-world',  'Washington Post · World', 'rss', 'https://feeds.washingtonpost.com/rss/world',             72, '{"domain":"washingtonpost.com"}'::jsonb),
  ('cbs-world',       'CBS · World',             'rss', 'https://www.cbsnews.com/latest/rss/world',               68, '{"domain":"cbsnews.com"}'::jsonb),
  ('aljazeera-world', 'Al Jazeera · World',      'rss', 'https://www.aljazeera.com/xml/rss/all.xml',              72, '{"domain":"aljazeera.com"}'::jsonb),
  ('france24-en',     'France 24 · EN',          'rss', 'https://www.france24.com/en/rss',                        72, '{"domain":"france24.com"}'::jsonb),
  ('dw-world',        'Deutsche Welle · World',  'rss', 'https://rss.dw.com/rdf/rss-en-world',                    72, '{"domain":"dw.com"}'::jsonb),
  ('japantimes',      'Japan Times',             'rss', 'https://www.japantimes.co.jp/feed/',                      68, '{"domain":"japantimes.co.jp"}'::jsonb),
  ('abc-au',          'ABC Australia',           'rss', 'https://www.abc.net.au/news/feed/51120/rss.xml',         70, '{"domain":"abc.net.au"}'::jsonb),
  ('allafrica',       'AllAfrica Top',           'rss', 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', 65, '{"domain":"allafrica.com"}'::jsonb),
  ('straits-times',   'Straits Times',           'rss', 'https://www.straitstimes.com/news/world/rss.xml',         67, '{"domain":"straitstimes.com"}'::jsonb),
  ('npr-world',       'NPR · World',             'rss', 'https://feeds.npr.org/1004/rss.xml',                     74, '{"domain":"npr.org"}'::jsonb),
  ('reliefweb',       'ReliefWeb · Updates',     'rss', 'https://reliefweb.int/updates/rss.xml',                  75, '{"domain":"reliefweb.int"}'::jsonb),
  ('usgs-quakes',     'USGS · M4.5+ Earthquakes','api', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson', 90, '{"domain":"usgs.gov","type":"earthquake"}'::jsonb),
  ('gdelt-doc',       'GDELT · Global Events',   'api', 'https://api.gdeltproject.org/api/v2/doc/doc',            65, '{"domain":"gdelt.org","type":"events"}'::jsonb),
  ('nasa-eonet',      'NASA · EONET Events',     'api', 'https://eonet.gsfc.nasa.gov/api/v3/events?days=2',       88, '{"domain":"nasa.gov","type":"natural_events"}'::jsonb),
  ('open-meteo-global','Open-Meteo Global Severe','api','https://api.open-meteo.com/v1/forecast',                 80, '{"domain":"open-meteo.com","type":"weather"}'::jsonb),
  ('noaa-alerts',     'NOAA Active Alerts',      'api', 'https://api.weather.gov/alerts/active?status=actual',    90, '{"domain":"weather.gov","type":"weather_alerts"}'::jsonb),
  ('yahoo-finance-global','Yahoo Finance Indices','api','https://query1.finance.yahoo.com/v7/finance/quote',      72, '{"domain":"finance.yahoo.com","type":"markets"}'::jsonb),
  ('coingecko-markets','CoinGecko Markets',      'api', 'https://api.coingecko.com/api/v3/coins/markets',         70, '{"domain":"coingecko.com","type":"markets"}'::jsonb),
  ('gvp-volcano',     'Smithsonian · Volcano',   'rss', 'https://volcano.si.edu/news/WeeklyVolcanoRSS.xml',       85, '{"domain":"si.edu","type":"volcano"}'::jsonb),
  ('nhc-atlantic',    'NHC · Atlantic',          'rss', 'https://www.nhc.noaa.gov/index-at.xml',                  90, '{"domain":"noaa.gov","type":"hurricane"}'::jsonb),
  ('cisa-advisories', 'CISA · Advisories',       'rss', 'https://www.cisa.gov/cybersecurity-advisories/all.xml',  85, '{"domain":"cisa.gov","type":"cyber"}'::jsonb),
  ('krebsonsecurity', 'Krebs On Security',       'rss', 'https://krebsonsecurity.com/feed/',                       72, '{"domain":"krebsonsecurity.com","type":"cyber"}'::jsonb)
on conflict (id) do update set
  name        = excluded.name,
  kind        = excluded.kind,
  url         = excluded.url,
  credibility = excluded.credibility,
  metadata    = excluded.metadata;
