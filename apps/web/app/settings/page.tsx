import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { SettingsForm } from '@/components/settings-form';

export const metadata = { title: 'Settings · Crosscheck' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/settings');

  const [{ data: prefs }, { data: sources }, { data: profile }] = await Promise.all([
    sb.from('preferences').select('*').eq('user_id', auth.user.id).maybeSingle(),
    sb
      .from('sources')
      .select('id, name, kind, credibility, metadata')
      .eq('enabled', true)
      .order('credibility', { ascending: false }),
    sb.from('profiles').select('display_name').eq('user_id', auth.user.id).maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-card border border-ink-100 bg-gradient-to-br from-brand-50/40 via-paper to-paper p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-brand-200/30 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-900 text-lg font-bold text-white shadow-sm">
              {(profile?.display_name ?? auth.user.email ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Settings</h1>
              <p className="text-sm text-ink-500">
                <span className="font-mono text-ink-600">{auth.user.email}</span>
              </p>
            </div>
          </div>
        </div>
      </header>
      <SettingsForm
        initial={prefs ?? null}
        sources={sources ?? []}
        account={{
          email: auth.user.email ?? '',
          display_name: profile?.display_name ?? '',
        }}
      />
    </div>
  );
}
