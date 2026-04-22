-- ============================================================================
-- 019 — Image observations (first-seen / duplicate hash tracking).
--
-- Phase 3 of the Crosscheck build plan adds deterministic image checks:
--   • When a user submits an image (with a SHA-256) to /verify, we record
--     the observation so later submissions can be flagged with
--     "previously seen" / "reused image — context mismatch risk" tags.
--   • Nothing in this table identifies a user — we only store the hash,
--     timestamps, distinct hosts we've observed the hash on, and a simple
--     counter. This is intentionally a cross-tenant dedup index, not a
--     per-user history (per-user history lives in `verifications`).
--
-- Design rules:
--   • No bytes stored here. No EXIF. No thumbnails. Just hashes.
--   • `seen_hosts` is a small text[] (capped at 10 in the app layer) so
--     pgcrypto-style workloads never blow up the row.
--   • Reads are public (the data is anonymous + useful for the ops page);
--     writes require service_role so user clients can never tamper.
--
-- Backfill/compatibility: additive. Zero existing rows to migrate.
-- ============================================================================

create table if not exists public.image_observations (
  sha256                text primary key,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  observation_count     integer not null default 1 check (observation_count >= 1),
  seen_hosts            text[] not null default '{}'::text[],
  first_host            text,
  first_context         text not null default 'verify'
                        check (first_context in ('verify','feed'))
);

create index if not exists image_observations_last_seen_idx
  on public.image_observations (last_seen_at desc);

alter table public.image_observations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'image_observations'
      and policyname = 'image_observations_public_read'
  ) then
    create policy image_observations_public_read on public.image_observations
      for select using (true);
  end if;
end $$;

grant select on public.image_observations to anon, authenticated;
grant select, insert, update on public.image_observations to service_role;
