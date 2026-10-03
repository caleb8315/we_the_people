-- Remove the browser-only XP experiment. The product no longer exposes
-- ranks, streaks, badges, or daily missions, and no server code ever wrote
-- to this table.
drop table if exists public.user_progress;
