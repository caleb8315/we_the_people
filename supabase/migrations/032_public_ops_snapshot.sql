-- 032 — Safe public operational snapshot.
-- `engine_runs` contains internal error/meta data and remains service-role only.
-- Public status/reliability pages may read this narrow, non-sensitive view.

create or replace view public.engine_runs_public as
select
  job,
  status,
  started_at,
  finished_at,
  records_out
from public.engine_runs;

grant select on public.engine_runs_public to anon, authenticated;
