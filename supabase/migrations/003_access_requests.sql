-- ============================================================================
-- Access requests · lightweight invite flow.
--
-- Flow:
--   1. Unknown email submits /login → row inserted here with status='pending'.
--   2. Operator opens this table in Supabase, flips status to 'approved'.
--   3. Trigger copies the email into public.beta_allowlist so their next
--      sign-in attempt receives a magic link.
--   4. Operator emails the user (manual for beta) so they know to retry.
-- ============================================================================

create table if not exists public.access_requests (
  id              uuid primary key default uuid_generate_v4(),
  email           text not null,
  reason          text,
  status          text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  referrer        text,
  user_agent      text,
  ip_hash         text,
  requested_at    timestamptz not null default now(),
  processed_at    timestamptz,
  processed_note  text,
  unique (email)
);

create index if not exists access_requests_status_idx
  on public.access_requests (status, requested_at desc);

alter table public.access_requests enable row level security;
-- Default deny (no public policies). Anon access goes through a server route.

-- Auto-promote approved rows into beta_allowlist.
create or replace function public.sync_access_request_to_allowlist()
returns trigger as $$
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    insert into public.beta_allowlist (email, invited_by, cohort, created_at)
    values (lower(new.email), coalesce(new.processed_note, 'access_request'), 'cohort1', now())
    on conflict (email) do nothing;
    new.processed_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists access_requests_sync on public.access_requests;
create trigger access_requests_sync
  before update on public.access_requests
  for each row execute function public.sync_access_request_to_allowlist();
