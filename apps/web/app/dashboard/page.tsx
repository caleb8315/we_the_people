import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { SignalCard } from '@/components/signal-card';
import { StatTile } from '@/components/ui/stat-tile';
import { Card } from '@/components/ui/card';
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
    { count: sessionCount },
    { data: briefing },
    { data: rawSignals },
  ] = await Promise.all([
    sb
      .from('profiles')
      .select('display_name, onboarded_at, last_dashboard_visit_at')
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    sb
      .from('preferences')
      .select(
        'topics, muted_sources, muted_topics, countries_of_focus, min_alert_severity, feed_mode_preference, briefing_frequency_preference, alert_intensity_preference, max_alerts_per_day_preference',
      )
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    sb.from('ai_sessions').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id),
    sb
      .from('briefings')
      .select('id, headline, period_start')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('signals_public')
      .select('*')
      .order('severity', { ascending: false })
      .limit(80),
  ]);

  if (!profile?.onboarded_at) redirect('/onboarding');

  const lastVisit = profile.last_dashboard_visit_at ?? null;
  const personal = personalizeSignals(((rawSignals ?? []) as SignalRowRaw[]), prefs);
  const decoratedPersonal = await decorateSignals(sb, personal.slice(0, 12), { newSince: lastVisit });

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const newCorroboratedCount = (rawSignals ?? []).filter(
    (s) => s.verification_status === 'verified' && s.first_seen_at >= dayAgo,
  ).length;
  const disputedCount = decoratedPersonal.reduce((n, s) => n + ((s.contradictions_count ?? 0) > 0 ? 1 : 0), 0);
  const topPriority = decoratedPersonal[0] ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: alertUsage } = await sb
    .from('user_daily_usage')
    .select('calls')
    .eq('user_id', auth.user.id)
    .eq('day', today)
    .eq('bucket', 'priority_alert');
  const alertsSentToday = (alertUsage ?? []).reduce((sum, r) => sum + Number(r.calls ?? 0), 0);

  // Fire-and-forget: mark the new last-visit time so "New" badges re-baseline next visit.
  void sb
    .from('profiles')
    .update({ last_dashboard_visit_at: new Date().toISOString() })
    .eq('user_id', auth.user.id);

  const name = profile.display_name || auth.user.email?.split('@')[0] || 'Analyst';

  return (
    <div className="space-y-8">
      <header className="rounded-card border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] p-5 sm:p-6">
        <p className="text-[11px] font-medium uppercase tracking-widest text-white/55">Workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Welcome back, {name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/70">
          Your personal consistency-check workspace. Scan the at-a-glance strip, review your priority signals, and
          jump to briefings or the AI analyst.
        </p>
      </header>

      <section aria-label="At a glance" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Top priority"
          value={topPriority ? topPriority.severity : '—'}
          hint={topPriority ? topPriority.title : 'No personalized signals yet'}
          tone={topPriority && topPriority.severity >= 85 ? 'danger' : 'neutral'}
          href={topPriority ? `/signal/${topPriority.id}` : undefined}
        />
        <StatTile
          label="Newly corroborated (24h)"
          value={newCorroboratedCount}
          hint="Corroborated across 2+ credible sources"
          tone="accent"
          href="/feed?mode=global"
        />
        <StatTile
          label="Source disagreements in your feed"
          value={disputedCount}
          hint="Sources disagree on a material detail"
          tone={disputedCount > 0 ? 'warn' : 'neutral'}
        />
        <StatTile
          label="Alerts sent today"
          value={alertsSentToday}
          hint={`Cap: ${prefs?.max_alerts_per_day_preference ?? 3}/day`}
          tone="neutral"
          href="/settings"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card title="Your focus">
          <p className="text-sm text-white/85">{(prefs?.topics ?? ['war', 'economy', 'climate']).join(' · ')}</p>
          <p className="mt-2 text-xs text-white/55">
            Feed mode: <strong className="text-white/75">{prefs?.feed_mode_preference ?? 'personalized'}</strong> · Briefings:{' '}
            <strong className="text-white/75">{prefs?.briefing_frequency_preference ?? 'daily'}</strong> · Alert intensity:{' '}
            <strong className="text-white/75">{prefs?.alert_intensity_preference ?? 'critical_only'}</strong>
          </p>
          <div className="mt-3">
            <Link href="/settings" className="text-sm text-brand-300 hover:underline">
              Update preferences
            </Link>
          </div>
        </Card>

        <Card title="Latest briefing">
          {briefing ? (
            <>
              <p className="text-sm font-medium text-white/90 clamp-2">{briefing.headline}</p>
              <p className="mt-1 text-xs text-white/50">{new Date(briefing.period_start).toLocaleString()}</p>
              <Link href={`/briefings/${briefing.id}`} className="mt-3 inline-block text-sm text-brand-300 hover:underline">
                Open briefing
              </Link>
            </>
          ) : (
            <p className="text-sm text-white/60">No briefing yet. Briefing jobs will populate this shortly.</p>
          )}
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <WorkspaceLink
          href="/dashboard/intel"
          title="Priority workspace"
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
          body={`Your own analyst memory — ${sessionCount ?? 0} session${sessionCount === 1 ? '' : 's'}.`}
        />
      </section>

      <section>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">My top signals</h2>
          <Link href="/feed" className="text-sm text-brand-300 hover:underline">
            View all
          </Link>
        </header>
        {decoratedPersonal.length === 0 ? (
          <EmptyState
            title="No personalized signals yet."
            body="Adjust your topics or try the global feed for now."
            action={{ label: 'Open global feed', href: '/feed?mode=global' }}
          />
        ) : (
          <ul className="space-y-3">
            {decoratedPersonal.slice(0, 5).map((s) => (
              <li key={s.id}>
                <SignalCard s={s as any} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WorkspaceLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="rounded-card border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.06]"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-white/60">{body}</p>
    </Link>
  );
}
