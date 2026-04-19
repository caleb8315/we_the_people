-- ============================================================================
-- Expand source catalog (free/public feeds + open datasets)
-- Adds broader global coverage so users can customize by muting sources.
-- ============================================================================

insert into public.sources (id, name, kind, url, credibility, metadata) values
  ('sky-world',             'Sky News · World',                              'rss', 'https://feeds.skynews.com/feeds/rss/world.xml',                               68, '{"domain":"skynews.com","type":"news_regional","region":"global"}'::jsonb),
  ('cbc-world',             'CBC · World',                                   'rss', 'https://www.cbc.ca/cmlink/rss-world',                                         72, '{"domain":"cbc.ca","type":"news_regional","region":"north_america"}'::jsonb),
  ('un-news-global',        'UN News · Global',                              'rss', 'https://news.un.org/feed/subscribe/en/news/all/rss.xml',                     84, '{"domain":"un.org","type":"official_bulletin","region":"global"}'::jsonb),
  ('gdacs-alerts',          'GDACS · Global Disaster Alerts',                'rss', 'https://www.gdacs.org/xml/rss.xml',                                           88, '{"domain":"gdacs.org","type":"humanitarian","region":"global"}'::jsonb),
  ('nasa-eo-hazards',       'NASA Earth Observatory · Natural Hazards',      'rss', 'https://earthobservatory.nasa.gov/feeds/natural-hazards.rss',                 82, '{"domain":"nasa.gov","type":"satellite","sensor":"earth_observation"}'::jsonb),
  ('nasa-eo-image',         'NASA Earth Observatory · Image of the Day',     'rss', 'https://earthobservatory.nasa.gov/feeds/image-of-the-day.rss',                74, '{"domain":"nasa.gov","type":"satellite","sensor":"imagery"}'::jsonb),
  ('esa-earth-observation', 'ESA · Earth Observation',                       'rss', 'https://www.esa.int/rssfeed/Our_Activities/Observing_the_Earth',              80, '{"domain":"esa.int","type":"satellite","sensor":"earth_observation"}'::jsonb),
  ('swpc-alerts',           'NOAA SWPC · Space Weather Alerts',              'api', 'https://services.swpc.noaa.gov/products/alerts.json',                         88, '{"domain":"swpc.noaa.gov","type":"space_weather"}'::jsonb),
  ('cisa-kev',              'CISA · Known Exploited Vulnerabilities',        'api', 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 92, '{"domain":"cisa.gov","type":"cyber_intel","dataset":"kev"}'::jsonb),
  ('sans-isc',              'SANS ISC · Infosec Diary',                      'rss', 'https://isc.sans.edu/rssfeed.xml',                                            78, '{"domain":"sans.edu","type":"cyber_intel"}'::jsonb),
  ('hackers-news',          'The Hacker News',                               'rss', 'https://feeds.feedburner.com/TheHackersNews',                                 70, '{"domain":"thehackernews.com","type":"cyber_intel"}'::jsonb),
  ('therecord-cyber',       'The Record · Cybersecurity',                    'rss', 'https://therecord.media/feed',                                                 74, '{"domain":"therecord.media","type":"cyber_intel"}'::jsonb),
  ('nist-news',             'NIST · News',                                   'rss', 'https://www.nist.gov/news-events/news/rss.xml',                               83, '{"domain":"nist.gov","type":"official_bulletin"}'::jsonb),
  ('africanews-top',        'AfricaNews · Top',                              'rss', 'https://www.africanews.com/feed/rss',                                          64, '{"domain":"africanews.com","type":"news_regional","region":"africa"}'::jsonb),
  ('jpost-world',           'Jerusalem Post · World',                        'rss', 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx',                             62, '{"domain":"jpost.com","type":"news_regional","region":"middle_east"}'::jsonb),
  ('hindu-world',           'The Hindu · International',                     'rss', 'https://www.thehindu.com/news/international/feeder/default.rss',               70, '{"domain":"thehindu.com","type":"news_regional","region":"south_asia"}'::jsonb),
  ('toi-world',             'Times of India · World',                        'rss', 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms',                   60, '{"domain":"timesofindia.indiatimes.com","type":"news_regional","region":"south_asia"}'::jsonb),
  ('usgs-significant',      'USGS · Significant Earthquakes',                'rss', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.atom', 91, '{"domain":"usgs.gov","type":"earthquake"}'::jsonb)
on conflict (id) do update set
  name        = excluded.name,
  kind        = excluded.kind,
  url         = excluded.url,
  credibility = excluded.credibility,
  metadata    = excluded.metadata;
