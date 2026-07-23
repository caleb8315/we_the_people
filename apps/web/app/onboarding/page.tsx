import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { OnboardingForm } from '@/components/onboarding-form';

export const metadata = { title: 'Onboarding · Crosscheck' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/onboarding');

  const { data: profile } = await sb
    .from('profiles')
    .select('display_name, onboarded_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (profile?.onboarded_at) redirect('/dashboard');

  const defaultName =
    profile?.display_name ||
    (typeof auth.user.user_metadata?.display_name === 'string'
      ? auth.user.user_metadata.display_name
      : '') ||
    auth.user.email?.split('@')[0] ||
    '';

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-signal">
          Welcome, Newcomer
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Set up your HQ</h1>
        <p className="mt-2 text-sm text-ink-600">
          One-time setup. Pick your name, focus topics, and how you want alerts. Earn XP as you check claims —
          you can change anything later.
        </p>
      </header>
      <div className="rounded-card border border-ink-100 bg-paper p-5">
        <OnboardingForm defaultName={defaultName} />
      </div>
    </div>
  );
}
