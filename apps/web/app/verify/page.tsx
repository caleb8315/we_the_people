import { VerifyClient } from './verify-client';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata = { title: 'Verify a claim · Crosscheck' };
export const dynamic = 'force-dynamic';

export default async function VerifyPage() {
  let signedIn = false;
  try {
    const sb = getServerSupabase();
    const { data: auth } = await sb.auth.getUser();
    signedIn = Boolean(auth.user);
  } catch {
    // Anonymous fallback when env/auth isn't available at build time.
  }

  return (
    <div className="space-y-6 sm:space-y-7">
      <header>
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-flare">
            Evidence check
          </p>
          <h1 className="mt-2 max-w-2xl font-display text-[34px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[44px]">
            Is this trustworthy?
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-ink-500 sm:text-base">
            Paste a URL, headline, or rumor. Get a straight yes or no, with what actually
            happened and the sources behind it.
          </p>
        </div>
      </header>
      <VerifyClient signedIn={signedIn} />
    </div>
  );
}
