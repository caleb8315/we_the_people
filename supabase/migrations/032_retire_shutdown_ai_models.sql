-- Repoint per-user AI profiles off model IDs the providers have shut down.
--
-- Google shut down the Gemini 2.0 family on 2026-06-01. `ai_profiles.model` is
-- sent verbatim as the Gemini model for analyst chat, so every row still
-- carrying the old default made the first provider in the chain return 404.
--
-- The application also substitutes retired IDs at call time, so chat works
-- whether or not this migration has been applied. This keeps the stored
-- preference honest and stops the dead ID being handed to new rows.

alter table public.ai_profiles
  alter column model set default 'gemini-3.6-flash';

update public.ai_profiles
set model = 'gemini-3.6-flash',
    updated_at = now()
where model in (
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
);
