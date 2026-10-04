import { investigatorConfigured } from '@osint/investigator';
import { VerifyWorkspace } from './verify-workspace';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata = { title: 'Investigate a claim · Crosscheck' };
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
            Investigate
          </p>
          <h1 className="mt-2 max-w-3xl font-display text-[34px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[44px]">
            Is it real, is it spin, and what actually happened?
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-ink-500 sm:text-base">
            Paste a claim, headline, or link in any language. Crosscheck investigates it the way a
            newsroom would — every side&apos;s media in their own language, the full articles,
            satellite and sensor data, and where the story started — then shows you the evidence
            behind its answer.
          </p>
        </div>
      </header>
      <VerifyWorkspace signedIn={signedIn} deepAvailable={investigatorConfigured()} />
    </div>
  );
}
