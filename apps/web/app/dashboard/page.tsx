import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { SignalCard } from '@/components/signal-card';
import { EmptyState } from '@/components/ui/empty-state';
import { decorateSignals, personalizeSignals, type SignalRowRaw } from '@/lib/signals';

export const metadata = { title: 'Dashboard · Crosscheck' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/dashboard');

  const [
    { data: profile },
    { data: prefs },
    { data: briefing },
    { data: rawSignals },
  ] = await Promise.all([
    sb.from('profiles').select('display_name, onboarded_at, last_dashboard_visit_at').eq('user_id', auth.user.id).maybeSingle(),
    sb.from('preferences').select('topics, muted_sources, muted_topics, countries_of_focus').eq('user_id', auth.user.id).maybeSingle(),
    sb.from('briefings').select('id, headline, period_start').order('period_start', { ascending: false }).limit(1).maybeSingle(),
    sb.from('signals_public').select('*').order('severity', { ascending: false }).limit(60),
  ]);

  if (!profile?.onboarded_at) redirect('/onboarding');

  const lastVisit = profile.last_dashboard_visit_at ?? null;
  const personal = personalizeSignals((rawSignals ?? []) as SignalRowRaw[], prefs);
  const signals = await decorateSignals(sb, personal.slice(0, 9), { newSince: lastVisit });

  void sb.from('profiles').update({ last_dashboard_visit_at: new Date().toISOString() }).eq('user_id', auth.user.id);

  const name = profile.display_name || auth.user.email?.split('@')[0] || 'there';

  return (
    <div className="space-y-10">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Hey, {name}
        </h1>
        <p className="mt-1 text-zinc-500">Here&apos;s what&apos;s happening across your sources.</p>
      </div>

      {/* Quick actions — bento grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BentoCard href="/feed" label="Live Feed" desc="All signals, filtered to you" accent />
        <BentoCard href="/verify" label="Verify" desc="Check any article" />
        <BentoCard href="/dashboard/intel" label="Priority Intel" desc="High-severity signals" />
        <BentoCard href="/briefings" label="Briefings" desc={briefing ? briefing.headline.slice(0, 40) + '...' : 'Daily & weekly summaries'} />
      </div>

      {/* Workspace links */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/dashboard/sources" className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-zinc-700 hover:bg-zinc-900/70">
          <p className="text-sm font-semibold text-zinc-200">Sources</p>
          <p className="mt-1 text-xs text-zinc-500">Manage your {(prefs?.topics ?? []).length || 3} tracked topics</p>
        </Link>
        <Link href="/dashboard/ai" className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-zinc-700 hover:bg-zinc-900/70">
          <p className="text-sm font-semibold text-zinc-200">Analyst</p>
          <p className="mt-1 text-xs text-zinc-500">Chat about any signal</p>
        </Link>
        <Link href="/settings" className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-zinc-700 hover:bg-zinc-900/70">
          <p className="text-sm font-semibold text-zinc-200">Settings</p>
          <p className="mt-1 text-xs text-zinc-500">Topics, alerts, preferences</p>
        </Link>
      </div>

      {/* Your signals */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Your signals</h2>
          <Link href="/feed" className="text-xs text-brand-400 hover:underline">View all →</Link>
        </div>
        {signals.length === 0 ? (
          <EmptyState
            title="No signals match your focus yet."
            body="Adjust your topics in Settings or explore the global feed."
            action={{ label: 'Open global feed', href: '/feed?mode=global' }}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {signals.slice(0, 6).map(s => (
              <SignalCard key={s.id} s={s as any} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BentoCard({ href, label, desc, accent }: { href: string; label: string; desc: string; accent?: boolean }) {
  return (
    <Link
      href={href}
      className={`group rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 ${
        accent
          ? 'border-brand-500/25 bg-gradient-to-br from-brand-500/10 to-zinc-900/50 hover:border-brand-500/40 hover:shadow-glow'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70'
      }`}
    >
      <p className={`text-lg font-semibold ${accent ? 'text-brand-400' : 'text-zinc-200'}`}>{label}</p>
      <p className="mt-1 text-xs text-zinc-500">{desc}</p>
    </Link>
  );
}
