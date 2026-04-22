import { getServerSupabase } from '@/lib/supabase-server';
import { NavBarClient } from './nav-bar-client';

export async function NavBar() {
  let signedIn = false;
  let displayName: string | null = null;
  try {
    const sb = getServerSupabase();
    const { data } = await sb.auth.getUser();
    signedIn = !!data.user;
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const nameFromMeta =
      typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null;
    displayName = nameFromMeta ?? data.user?.email?.split('@')[0] ?? null;
  } catch {
    // Anonymous nav if Supabase is not yet configured.
  }

  return <NavBarClient signedIn={signedIn} displayName={displayName} />;
}
