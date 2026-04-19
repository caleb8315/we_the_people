import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata = { title: 'Sources · OSINT Platform' };
export const dynamic = 'force-dynamic';

export default async function SourcesPage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/dashboard/sources');
  const { data: profile } = await sb
    .from('profiles')
    .select('onboarded_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect('/onboarding');

  const [{ data: sources }, { data: prefs }] = await Promise.all([
    sb
      .from('sources')
      .select('id, name, kind, credibility, metadata, enabled')
      .eq('enabled', true)
      .order('credibility', { ascending: false }),
    sb.from('preferences').select('muted_sources').eq('user_id', auth.user.id).maybeSingle(),
  ]);

  const muted = new Set(prefs?.muted_sources ?? []);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Source control</h1>
        <p className="text-sm text-white/60">
          Global source catalog with credibility scores. Your muted sources are flagged and excluded from your personal view.
        </p>
      </header>

      <ul className="grid gap-2 sm:grid-cols-2">
        {(sources ?? []).map((s) => (
          <li key={s.id} className="rounded border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{s.name}</p>
              <span className="text-xs text-white/60">cred {s.credibility}</span>
            </div>
            <div className="mt-1 text-xs text-white/50">
              {s.kind.toUpperCase()} · id {s.id}
            </div>
            <div className="mt-2 text-xs">
              {muted.has(s.id) ? (
                <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-300">Muted in your account</span>
              ) : (
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">Active in your account</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
