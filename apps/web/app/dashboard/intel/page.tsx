import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { SignalCard } from '@/components/signal-card';
import { StatTile } from '@/components/ui/stat-tile';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { SignalsMap } from '@/components/signals-map';
import { decorateSignals, type SignalRowRaw } from '@/lib/signals';
import { signalGeoPoint, type SignalGeoPoint } from '@/lib/signal-geo';
import { logProductEvent } from '@/lib/product-events';

export const metadata = { title: 'Priority Workspace · Crosscheck' };
export const dynamic = 'force-dynamic';
const VIEWS = ['list', 'map'] as const;
type IntelView = (typeof VIEWS)[number];

export default async function IntelWorkspacePage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/dashboard/intel');

  const { data: profile } = await sb
    .from('profiles')
    .select('onboarded_at, last_dashboard_visit_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect('/onboarding');

  const requestedView = parseView(searchParams.view);
  const [{ data: prefs }, { data: rawSignals }, { data: savedViews }] = await Promise.all([
    sb
      .from('preferences')
      .select('topics, min_alert_severity, alert_intensity_preference, feed_view_preference')
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    sb
      .from('signals_public')
      .select('*')
      .in('verification_status', ['verified', 'developing'])
      .gte('severity', 60)
      .order('severity', { ascending: false })
      .limit(80),
    sb
      .from('user_saved_views')
      .select('id, name, context, view_mode, filters, updated_at')
      .eq('user_id', auth.user.id)
      .eq('context', 'intel')
      .order('updated_at', { ascending: false })
      .limit(5),
  ]);

  const focusTopics = new Set((prefs?.topics ?? ['war', 'economy', 'climate']) as string[]);
  const rows = (rawSignals ?? []) as SignalRowRaw[];
  const prioritizedRaw = rows.filter((s) => focusTopics.has(s.topic ?? 'other'));
  const overflowRaw = rows.filter((s) => !focusTopics.has(s.topic ?? 'other'));

  const [prioritized, overflow] = await Promise.all([
    decorateSignals(sb, prioritizedRaw, { newSince: profile.last_dashboard_visit_at ?? null }),
    decorateSignals(sb, overflowRaw.slice(0, 30), { newSince: profile.last_dashboard_visit_at ?? null }),
  ]);
  const view: IntelView = requestedView ?? parseView(String(prefs?.feed_view_preference ?? 'list')) ?? 'list';
  const geoPoints: SignalGeoPoint[] = prioritized.map((s) => signalGeoPoint(s)).filter((x): x is SignalGeoPoint => Boolean(x));

  const disputedCount = prioritized.reduce((n, s) => n + (s.is_disputed ? 1 : 0), 0);
  const criticalCount = prioritized.filter((s) => s.severity >= 85).length;

  if (requestedView && requestedView !== prefs?.feed_view_preference) {
    void sb.from('preferences').update({ feed_view_preference: requestedView }).eq('user_id', auth.user.id);
    void logProductEvent(sb, {
      userId: auth.user.id,
      eventName: 'feed_view_toggled',
      eventProps: { from: prefs?.feed_view_preference ?? 'list', to: requestedView, context: 'intel' },
    });
  }
  if (view === 'map') {
    void logProductEvent(sb, {
      userId: auth.user.id,
      eventName: 'map_opened',
      eventProps: { context: 'intel', points: geoPoints.length },
    });
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <header>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Priority workspace</h1>
            <p className="mt-1 text-sm text-ink-500">
              Prioritized by your focus topics and how well each signal is corroborated. Alert intensity:{' '}
              {prefs?.alert_intensity_preference ?? 'critical_only'}. Threshold: {prefs?.min_alert_severity ?? 70}.
            </p>
          </div>
          <Segmented
            ariaLabel="Intel view mode"
            className="w-full sm:w-auto"
            active={view}
            options={[
              { label: 'List', value: 'list', href: '/dashboard/intel?view=list' },
              { label: `Map (${geoPoints.length})`, value: 'map', href: '/dashboard/intel?view=map' },
            ]}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-500">Saved views:</span>
          {(savedViews ?? []).length === 0 ? (
            <span className="text-ink-400">none yet</span>
          ) : (
            (savedViews ?? []).map((sv: any) => {
              const f = (sv.filters ?? {}) as Record<string, unknown>;
              const savedView = typeof f.view_mode === 'string' ? f.view_mode : sv.view_mode;
              const href = `/dashboard/intel?view=${savedView}`;
              return (
                <Link
                  key={sv.id}
                  href={href}
                  className="rounded-full border border-ink-100 px-2 py-1 text-[11px] text-ink-600 hover:border-ink-200 hover:text-ink sm:px-2.5 sm:text-xs"
                >
                  {sv.name}
                </Link>
              );
            })
          )}
          <SaveIntelViewButton
            view={view}
            payload={{ topics: [...focusTopics], min_alert_severity: prefs?.min_alert_severity ?? 70 }}
          />
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Priority signals" value={prioritized.length} hint="Matched your focus topics" />
        <StatTile label="Critical (sev 85+)" value={criticalCount} tone={criticalCount > 0 ? 'danger' : 'neutral'} />
        <StatTile label="Source disagreements" value={disputedCount} tone={disputedCount > 0 ? 'warn' : 'neutral'} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-600">Priority queue</h2>
        {prioritized.length === 0 ? (
          <EmptyState
            title="Nothing here yet."
            body="Signals matching your focus will appear as they come in."
            action={{ label: 'See global feed', href: '/feed?mode=global' }}
          />
        ) : view === 'map' ? (
          <SignalsMap
            points={geoPoints}
            context="intel"
            mapHeightClass="h-[48vh] min-h-[300px] sm:h-[54vh] sm:min-h-[380px]"
            emptyMessage="Priority signals are present, but none have mappable geospatial metadata."
          />
        ) : (
          <ul className="space-y-3">
            {prioritized.slice(0, 25).map((s) => (
              <li key={s.id}>
                <SignalCard s={s} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-600">Additional global signals</h2>
        {overflow.length === 0 ? (
          <p className="rounded-card border border-ink-100 bg-paper p-4 text-sm text-ink-500">
            No additional signals right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {overflow.slice(0, 15).map((s) => (
              <li key={s.id}>
                <SignalCard s={s} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function parseView(view: string | undefined): IntelView | null {
  if (!view) return null;
  return VIEWS.includes(view as IntelView) ? (view as IntelView) : null;
}

function SaveIntelViewButton({
  view,
  payload,
}: {
  view: IntelView;
  payload: Record<string, unknown>;
}) {
  return (
    <form action="/api/saved-views" method="post" className="inline">
      <input type="hidden" name="name" value={`Intel · ${view}`} />
      <input type="hidden" name="context" value="intel" />
      <input type="hidden" name="view_mode" value={view} />
      <input
        type="hidden"
        name="filters"
        value={JSON.stringify({
          ...payload,
          view_mode: view,
        })}
      />
      <button
        type="submit"
        className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-brand-700 hover:bg-brand-100"
      >
        Save current view
      </button>
    </form>
  );
}
