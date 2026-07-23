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
          <p className="kicker">Verification workspace</p>
          <h1 className="page-title">Is this trustworthy?</h1>
          <p className="page-description">
            Paste a URL, headline, or rumor. Get a clear call — looks solid, still forming, thin so
            far, or sources clash — with both sides when they disagree.
          </p>
        </div>
      </header>
      <VerifyClient signedIn={signedIn} />
    </div>
  );
}
