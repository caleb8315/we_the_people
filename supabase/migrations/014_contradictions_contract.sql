-- Align `public.contradictions` with the required detection contract:
--   signal_id: uuid          (already present)
--   type:      enum text     NEW — cause_conflict | numeric_conflict | presence_conflict
--   severity:  enum text     NEW — low | medium | high
--   summary:   text          NEW — short, human-readable description
--   metadata:  jsonb         NEW — structured per-type payload
--   evidence_ids: uuid[]     (already present)
--   created_at: timestamptz  (already present)
--
-- Legacy columns (claim / observation / explanation / confidence) are kept
-- nullable so older rows and older UI builds keep working; the ingest
-- pipeline populates both the new columns and the legacy columns on every
-- write. The ingest job is idempotent per signal (delete-then-insert in a
-- single transaction), so rows never duplicate across runs.

alter table public.contradictions
  add column if not exists type text,
  add column if not exists severity text default 'medium',
  add column if not exists summary text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Backfill older rows so we can safely enforce NOT NULL on the new columns.
update public.contradictions
set
  type = coalesce(type, 'numeric_conflict'),
  severity = coalesce(severity, 'medium'),
  summary = coalesce(
    summary,
    nullif(trim(coalesce(claim, '') || ' vs ' || coalesce(observation, '')), 'vs'),
    'Legacy source-disagreement row.'
  ),
  metadata = coalesce(metadata, '{}'::jsonb)
where type is null or summary is null;

-- Enforce the contract going forward.
do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public' and constraint_name = 'contradictions_type_check'
  ) then
    alter table public.contradictions
      add constraint contradictions_type_check
      check (type in ('cause_conflict','numeric_conflict','presence_conflict'));
  end if;

  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public' and constraint_name = 'contradictions_severity_check'
  ) then
    alter table public.contradictions
      add constraint contradictions_severity_check
      check (severity in ('low','medium','high'));
  end if;
end $$;

alter table public.contradictions
  alter column type set not null,
  alter column severity set not null,
  alter column summary set not null;

-- Legacy columns are no longer required (older NOT NULLs would block
-- inserts when the new pipeline supplies only the new fields).
alter table public.contradictions
  alter column claim drop not null,
  alter column observation drop not null;

create index if not exists contradictions_type_idx
  on public.contradictions (type);
create index if not exists contradictions_severity_idx
  on public.contradictions (severity);
