import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { AiWorkspace } from '@/components/ai-workspace';
import { StatTile } from '@/components/ui/stat-tile';

export const metadata = { title: 'AI Workspace · Crosscheck' };
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

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: usage }, { count: sessions }, { data: aiProfile }] = await Promise.all([
    sb
      .from('user_daily_usage')
      .select('calls')
      .eq('user_id', auth.user.id)
      .eq('day', today)
      .eq('bucket', 'ai_chat'),
    sb.from('ai_sessions').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id),
    sb.from('ai_profiles').select('model, temperature').eq('user_id', auth.user.id).maybeSingle(),
  ]);

  const chatsToday = (usage ?? []).reduce((sum, r) => sum + Number(r.calls ?? 0), 0);
  const chatCap = 10;
  const remaining = Math.max(0, chatCap - chatsToday);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">AI workspace</h1>
        <p className="mt-1 text-sm text-white/60">
          User-isolated chat memory and model context. Your sessions are private to your account.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Chats today"
          value={`${chatsToday}/${chatCap}`}
          hint={`${remaining} remaining in beta`}
          tone={remaining <= 2 ? 'warn' : 'accent'}
        />
        <StatTile label="Total sessions" value={sessions ?? 0} hint="Private to your account" />
        <StatTile label="Model" value={aiProfile?.model ?? 'gemini-2.0-flash'} hint={`temp ${aiProfile?.temperature ?? 0.4}`} />
      </section>

      <AiWorkspace />
    </div>
  );
}
