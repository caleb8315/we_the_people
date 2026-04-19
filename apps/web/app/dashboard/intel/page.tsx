import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { SignalCard } from '@/components/signal-card';
import { StatTile } from '@/components/ui/stat-tile';
import { EmptyState } from '@/components/ui/empty-state';
import { decorateSignals, type SignalRowRaw } from '@/lib/signals';

export const metadata = { title: 'Intel Workspace · OSINT Platform' };
export const dynamic = 'force-dynamic';

export default async function IntelWorkspacePage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/dashboard/intel');

  const { data: profile } = await sb
    .from('profiles')
    .select('onboarded_at, last_dashboard_visit_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect('/onboarding');

  const [{ data: prefs }, { data: rawSignals }] = await Promise.all([
    sb
      .from('preferences')
      .select('topics, min_alert_severity, alert_intensity_preference')
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    sb
      .from('signals_public')
      .select('*')
      .in('verification_status', ['verified', 'developing'])
      .gte('severity', 60)
      .order('severity', { ascending: false })
      .limit(80),
  ]);

  const focusTopics = new Set((prefs?.topics ?? ['war', 'economy', 'climate']) as string[]);
  const rows = (rawSignals ?? []) as SignalRowRaw[];
  const prioritizedRaw = rows.filter((s) => focusTopics.has(s.topic ?? 'other'));
  const overflowRaw = rows.filter((s) => !focusTopics.has(s.topic ?? 'other'));

  const [prioritized, overflow] = await Promise.all([
    decorateSignals(sb, prioritizedRaw, { newSince: profile.last_dashboard_visit_at ?? null }),
    decorateSignals(sb, overflowRaw.slice(0, 30), { newSince: profile.last_dashboard_visit_at ?? null }),
  ]);

  const disputedCount = prioritized.reduce((n, s) => n + (s.is_disputed ? 1 : 0), 0);
  const criticalCount = prioritized.filter((s) => s.severity >= 85).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Intel workspace</h1>
        <p className="mt-1 text-sm text-white/60">
          Prioritized by your focus topics and verification quality. Alert intensity:{' '}
          {prefs?.alert_intensity_preference ?? 'critical_only'}. Threshold: {prefs?.min_alert_severity ?? 70}.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Priority signals" value={prioritized.length} hint="Matched your focus topics" />
        <StatTile label="Critical (sev 85+)" value={criticalCount} tone={criticalCount > 0 ? 'danger' : 'neutral'} />
        <StatTile label="Disputed" value={disputedCount} tone={disputedCount > 0 ? 'warn' : 'neutral'} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/70">Priority queue</h2>
        {prioritized.length === 0 ? (
          <EmptyState
            title="Nothing here yet."
            body="Signals matching your focus will appear as they come in."
            action={{ label: 'See global feed', href: '/feed?mode=global' }}
          />
        ) : (
          <ul className="space-y-3">
            {prioritized.slice(0, 25).map((s) => (
              <li key={s.id}>
                <SignalCard s={s as any} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/70">Additional global signals</h2>
        {overflow.length === 0 ? (
          <p className="rounded-card border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
            No additional signals right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {overflow.slice(0, 15).map((s) => (
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
