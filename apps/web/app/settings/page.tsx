import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { SettingsForm } from '@/components/settings-form';

export const metadata = { title: 'Settings · Crosscheck' };

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
      <nav className="flex items-center gap-1 overflow-x-auto rounded-full border border-ink-100 bg-paper/70 p-1 shadow-sm">
        {[
          { href: '/dashboard', label: 'Dashboard' },
          { href: '/feed', label: 'Feed' },
          { href: '/verify', label: 'Verify' },
          { href: '/briefings', label: 'Briefings' },
          { href: '/settings', label: 'Settings', active: true },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition ${
              l.active
                ? 'bg-ink-900 text-white shadow-sm'
                : 'text-ink-500 hover:bg-ink-100 hover:text-ink'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-ink-500">
          Signed in as <span className="font-mono text-ink-600">{auth.user.email}</span>.
        </p>
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
