import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { AiWorkspace } from '@/components/ai-workspace';

export const metadata = { title: 'AI Workspace · OSINT Platform' };
export const dynamic = 'force-dynamic';

export default async function AiPage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/dashboard/ai');
  const { data: profile } = await sb
    .from('profiles')
    .select('onboarded_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect('/onboarding');

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">AI workspace</h1>
        <p className="text-sm text-white/60">
          User-isolated chat memory and model context. Your sessions are private to your account.
        </p>
      </header>
      <AiWorkspace />
    </div>
  );
}
