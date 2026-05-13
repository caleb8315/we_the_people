-- ============================================================================
-- Drop the access-request + beta-allowlist invite flow.
--
-- This migration removes the invite-only gating that fronted email/password
-- auth. Going forward, anyone can sign up directly through Supabase Auth, so
-- the `access_requests` table, its trigger, and the `beta_allowlist` table
-- are no longer needed.
--
-- Safe to run on environments that never had 003_access_requests.sql applied:
-- every drop is IF EXISTS.
-- ============================================================================

drop trigger if exists access_requests_sync on public.access_requests;
drop function if exists public.sync_access_request_to_allowlist();

drop table if exists public.access_requests;
drop table if exists public.beta_allowlist;
