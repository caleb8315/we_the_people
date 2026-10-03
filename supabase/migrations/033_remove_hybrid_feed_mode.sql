-- The product only implements personalized and global feeds. Normalize the
-- unused hybrid value before narrowing the database contract.
update public.preferences
set feed_mode_preference = 'personalized'
where feed_mode_preference = 'hybrid';

alter table public.preferences
  drop constraint if exists preferences_feed_mode_preference_check;

alter table public.preferences
  add constraint preferences_feed_mode_preference_check
  check (feed_mode_preference in ('personalized', 'global'));
