-- ============================================================================
-- Add NASA FIRMS fire detection source.
-- Requires FIRMS_MAP_KEY env var to activate.
-- ============================================================================

insert into public.sources (id, name, kind, url, credibility, metadata) values
  ('nasa-firms', 'NASA FIRMS · Fire Detections', 'api', 'https://firms.modaps.eosdis.nasa.gov/api/area/', 88, '{"domain":"firms.modaps.eosdis.nasa.gov","type":"satellite","sensor":"thermal_anomaly"}'::jsonb)
on conflict (id) do update set
  name        = excluded.name,
  kind        = excluded.kind,
  url         = excluded.url,
  credibility = excluded.credibility,
  metadata    = excluded.metadata;
