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
      <h1 className="text-3xl font-semibold tracking-tight">Welcome to your workspace</h1>
      <p className="text-sm text-white/70">
        One-time setup. Pick your identity and focus topics, then your dashboard and AI workspace will be personalized.
      </p>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <OnboardingForm defaultName={defaultName} />
      </div>
    </div>
  );
}
