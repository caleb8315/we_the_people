import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata = { title: 'Dashboard · OSINT Platform' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/dashboard');

  const [{ data: profile }, { data: prefs }, { data: aiProfile }, { count: sessionCount }, { data: briefing }, { data: topSignals }] =
    await Promise.all([
      sb.from('profiles').select('display_name, onboarded_at').eq('user_id', auth.user.id).maybeSingle(),
      sb.from('preferences').select('topics, min_alert_severity').eq('user_id', auth.user.id).maybeSingle(),
      sb.from('ai_profiles').select('model, temperature').eq('user_id', auth.user.id).maybeSingle(),
      sb.from('ai_sessions').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id),
      sb.from('briefings').select('id, headline, period_start').order('period_start', { ascending: false }).limit(1).maybeSingle(),
      sb.from('signals_public').select('id, title, severity').order('severity', { ascending: false }).limit(3),
    ]);

  if (!profile?.onboarded_at) redirect('/onboarding');

  const name = profile.display_name || auth.user.email?.split('@')[0] || 'Analyst';

  return (
    <div className="space-y-8">
      <header className="rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] p-6">
        <p className="text-xs uppercase tracking-widest text-white/50">Workspace</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back, {name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/70">
          This dashboard is your personal intelligence workspace. It is separate from the public landing page and tailored to your account settings.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="AI model" value={aiProfile?.model ?? 'gemini-2.0-flash'} />
        <StatCard label="AI sessions" value={String(sessionCount ?? 0)} />
        <StatCard label="Alert threshold" value={`${prefs?.min_alert_severity ?? 70}`} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">Your focus</h2>
          <p className="mt-2 text-sm text-white/80">
            {(prefs?.topics ?? ['war', 'economy', 'climate']).join(' · ')}
          </p>
          <div className="mt-4">
            <Link href="/settings" className="text-sm underline">
              Update preferences
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">Latest briefing</h2>
          {briefing ? (
            <>
              <p className="mt-2 text-sm text-white/90">{briefing.headline}</p>
              <p className="mt-1 text-xs text-white/50">{new Date(briefing.period_start).toLocaleString()}</p>
              <Link href={`/briefings/${briefing.id}`} className="mt-4 inline-block text-sm underline">
                Open briefing
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-white/60">No briefing yet. Ingestion and briefing jobs will populate this.</p>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <WorkspaceLink
          href="/dashboard/intel"
          title="Intel workspace"
          body="Prioritized, high-severity signals filtered to your focus."
        />
        <WorkspaceLink
          href="/dashboard/sources"
          title="Source control"
          body="Global source map, credibility tiers, and what is currently active."
        />
        <WorkspaceLink
          href="/dashboard/ai"
          title="AI analyst"
          body="Your own analyst chat memory and model settings."
        />
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">Top live signals</h2>
        <ul className="mt-3 space-y-2">
          {(topSignals ?? []).map((signal) => (
            <li key={signal.id} className="flex items-center justify-between rounded border border-white/10 px-3 py-2">
              <Link href={`/signal/${signal.id}`} className="text-sm hover:underline">
                {signal.title}
              </Link>
              <span className="text-xs text-white/50">sev {signal.severity}</span>
            </li>
          ))}
          {(topSignals?.length ?? 0) === 0 && (
            <li className="text-sm text-white/60">No signals yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function WorkspaceLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06]">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-xs text-white/60">{body}</p>
    </Link>
  );
}
