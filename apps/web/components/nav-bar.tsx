import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase-server';
import { SignOutButton } from '@/components/signout-button';

export async function NavBar() {
  let signedIn = false;
  try {
    const sb = getServerSupabase();
    const { data } = await sb.auth.getUser();
    signedIn = !!data.user;
  } catch {
    // Anonymous nav if Supabase is not yet configured.
  }

  return (
    <header className="border-b border-white/10 bg-base-900/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-5 py-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          OSINT <span className="text-white/50">Platform</span>
        </Link>
        <nav className="flex flex-1 items-center gap-4 text-sm text-white/70">
          {signedIn && <Link href="/dashboard" className="hover:text-white">Dashboard</Link>}
          <Link href="/feed" className="hover:text-white">Feed</Link>
          <Link href="/briefings" className="hover:text-white">Briefings</Link>
          <Link href="/trust" className="hover:text-white">Trust</Link>
          <Link href="/about" className="hover:text-white">About</Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {signedIn ? (
            <>
              <Link href="/settings" className="rounded border border-white/15 px-3 py-1.5 hover:bg-white/10">
                Settings
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link href="/login" className="rounded bg-white text-black px-3 py-1.5 font-medium hover:bg-white/90">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
