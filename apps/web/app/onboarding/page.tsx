import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { OnboardingForm } from '@/components/onboarding-form';

export const metadata = { title: 'Onboarding · OSINT Platform' };
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300">Welcome</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Set up your workspace</h1>
        <p className="mt-2 text-sm text-white/70">
          One-time setup. Pick your identity, focus topics, and delivery defaults. You can change anything later.
        </p>
      </header>
      <div className="rounded-card border border-white/10 bg-white/[0.03] p-5">
        <OnboardingForm defaultName={defaultName} />
      </div>
    </div>
  );
}
