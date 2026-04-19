import { getServerSupabase } from '@/lib/supabase-server';
import { NavBarClient } from './nav-bar-client';

export async function NavBar() {
  let signedIn = false;
  try {
    const sb = getServerSupabase();
    const { data } = await sb.auth.getUser();
    signedIn = !!data.user;
  } catch {
    // Anonymous nav if Supabase is not yet configured.
  }

  return <NavBarClient signedIn={signedIn} />;
}
