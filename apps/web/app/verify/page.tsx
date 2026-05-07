import { VerifyClient } from './verify-client';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata = { title: 'Compare a claim · Crosscheck' };

export default async function VerifyPage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  const signedIn = Boolean(auth.user);

  return (
    <div className="space-y-6 sm:space-y-7">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
          Evidence comparison
        </p>
        <h1 className="mt-2 max-w-2xl text-[34px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[44px]">
          Compare a claim against the evidence,
          <br />
          <span className="text-ink-500">before you share it.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-ink-500 sm:text-base">
          Paste a URL or claim. You&rsquo;ll get ranked sources, classified conflicts, a separate
          bias signal, evidence cards with stance, and a confidence breakdown that explains every
          score. Social posts cap at <strong className="text-ink-700">medium</strong> on their own.
        </p>
      </header>
      <VerifyClient signedIn={signedIn} />
    </div>
  );
}
