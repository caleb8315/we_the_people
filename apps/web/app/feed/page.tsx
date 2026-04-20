import Link from 'next/link';
import { headers } from 'next/headers';
import { getServerSupabase } from '@/lib/supabase-server';
import { SignalCard } from '@/components/signal-card';
import { Segmented } from '@/components/ui/segmented';
import { ChipRow } from '@/components/ui/chip-row';
import { EmptyState } from '@/components/ui/empty-state';
import { SignalsMap } from '@/components/signals-map';
import { logProductEvent } from '@/lib/product-events';
import { decorateSignals, personalizeSignals, type SignalRowRaw } from '@/lib/signals';
import { signalGeoPoint, type SignalGeoPoint } from '@/lib/signal-geo';

export const metadata = { title: 'Feed · Crosscheck' };
export const revalidate = 60;

const TOPICS = ['all', 'war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster'] as const;
const MODES = ['personalized', 'global'] as const;
const VIEWS = ['list', 'map'] as const;
type FeedMode = (typeof MODES)[number];
type FeedView = (typeof VIEWS)[number];

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { topic?: string; hours?: string; mode?: string; view?: string; min_severity?: string };
}) {
  const topic = (searchParams.topic ?? 'all').toLowerCase();
  const hours = clamp(Number(searchParams.hours ?? '48'), 1, 24 * 14);
  const requestedMode = parseMode(searchParams.mode);
  const requestedView = parseView(searchParams.view);
  const minSeverity = clamp(Number(searchParams.min_severity ?? '0'), 0, 100);

  const sb = getServerSupabase();
  const hdrs = headers();
  const userAgent = hdrs.get('user-agent') ?? '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id ?? null;

  const [{ data: prefs }, { data: savedViews }] = await Promise.all([
    userId
    ? await sb
        .from('preferences')
        .select('topics, muted_sources, muted_topics, countries_of_focus, feed_mode_preference, feed_view_preference')
        .eq('user_id', userId)
        .maybeSingle()
    : Promise.resolve({ data: null }),
    userId
      ? sb
          .from('user_saved_views')
          .select('id, name, context, view_mode, filters, updated_at')
          .eq('user_id', userId)
          .eq('context', 'feed')
          .order('updated_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  const defaultMode: FeedMode = prefs?.feed_mode_preference === 'global' ? 'global' : 'personalized';
  const mode: FeedMode = userId ? requestedMode ?? defaultMode : 'global';
  const prefView = String(prefs?.feed_view_preference ?? 'list') as FeedView;
  const view: FeedView = requestedView ?? (userId ? prefView : 'list');
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  let q = sb
    .from('signals')
    .select(
      'id,title,summary,url,topic,country_code,severity,confidence,verification_status,source_count,credible_source_count,distinct_domains,source_id,occurred_at,first_seen_at,raw_data,expires_at',
    )
    .gte('first_seen_at', since)
    .in('verification_status', ['verified', 'developing', 'unverified'])
    .order('severity', { ascending: false })
    .limit(80);
  if (topic !== 'all') q = q.eq('topic', topic);
  if (minSeverity > 0) q = q.gte('severity', minSeverity);

  const { data, error } = await q;
  const nowIso = new Date().toISOString();
  const allSignals = ((data ?? []) as Array<SignalRowRaw & { expires_at?: string | null }>).filter(
    (s) => !s.expires_at || s.expires_at > nowIso,
  );
  const filtered = mode === 'personalized' ? personalizeSignals(allSignals, prefs) : allSignals;
  const signals = await decorateSignals(sb, filtered);
  const geoPoints: SignalGeoPoint[] = signals
    .map((s) => signalGeoPoint(s))
    .filter((x): x is SignalGeoPoint => Boolean(x));

  if (userId) {
    void logProductEvent(sb, {
      userId,
      eventName: 'feed_viewed',
      eventProps: {
        mode,
        view,
        topic,
        hours,
        min_severity: minSeverity,
        is_mobile: isMobile,
        map_points: geoPoints.length,
        personalized_result_count: signals.length,
      },
    });
    if (requestedMode && requestedMode !== defaultMode) {
      void logProductEvent(sb, {
        userId,
        eventName: 'feed_mode_switched',
        eventProps: { from: defaultMode, to: requestedMode },
      });
    }
    if (requestedView && requestedView !== prefView) {
      void logProductEvent(sb, {
        userId,
        eventName: 'feed_view_toggled',
        eventProps: { from: prefView, to: requestedView, context: 'feed' },
      });
      void sb
        .from('preferences')
        .update({ feed_view_preference: requestedView })
        .eq('user_id', userId);
    }
    if (view === 'map') {
      void logProductEvent(sb, {
        userId,
        eventName: 'map_opened',
        eventProps: { context: 'feed', topic, points: geoPoints.length, min_severity: minSeverity },
      });
    }
    void logProductEvent(sb, {
      userId,
      eventName: 'feed_scrolled_depth',
      eventProps: { context: 'feed', depth_bucket: signals.length >= 25 ? 'deep' : signals.length >= 10 ? 'mid' : 'shallow' },
    });
  }

  const qp = (m: string, t: string, v: FeedView = view, sev: number = minSeverity) =>
    `/feed?mode=${m}&topic=${t}&hours=${hours}&view=${v}&min_severity=${sev}`;
  const severityStops = [0, 60, 75, 85] as const;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Live feed</h1>
            <p className="mt-1 text-sm text-white/60">
              {mode === 'personalized'
                ? `Your personalized queue for the past ${hours}h.`
                : `Global queue ranked by severity for the past ${hours}h.`}
            </p>
            {!userId && (
              <p className="mt-1 text-xs text-white/45">
                Public view: this feed is not connected to any user profile.
              </p>
            )}
          </div>

          {userId && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              <Segmented
                ariaLabel="Feed mode"
                active={mode}
                options={[
                  { label: 'My feed', value: 'personalized', href: qp('personalized', topic) },
                  { label: 'Global feed', value: 'global', href: qp('global', topic) },
                ]}
              />
              <Segmented
                ariaLabel="Feed view"
                active={view}
                options={[
                  { label: 'List', value: 'list', href: qp(mode, topic, 'list') },
                  { label: `Map (${geoPoints.length})`, value: 'map', href: qp(mode, topic, 'map') },
                ]}
              />
            </div>
          )}
        </div>

        <ChipRow
          active={topic}
          options={TOPICS.map((t) => ({ label: t, value: t, href: qp(mode, t) }))}
          onClear={undefined}
        />

        {userId && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-white/55">Saved views:</span>
            {(savedViews ?? []).length === 0 ? (
              <span className="text-white/45">none yet</span>
            ) : (
              (savedViews ?? []).map((sv: any) => {
                const f = (sv.filters ?? {}) as Record<string, unknown>;
                const savedTopic = typeof f.topic === 'string' ? f.topic : 'all';
                const savedMode = typeof f.mode === 'string' ? f.mode : mode;
                const savedHours = Number(f.hours ?? hours);
                const savedMinSev = Number(f.min_severity ?? 0);
                const href = `/feed?mode=${savedMode}&topic=${savedTopic}&hours=${savedHours}&view=${sv.view_mode}&min_severity=${savedMinSev}`;
                return (
                  <Link
                    key={sv.id}
                    href={href}
                    className="rounded-full border border-white/15 px-2.5 py-1 text-white/70 hover:border-white/30 hover:text-white"
                  >
                    {sv.name}
                  </Link>
                );
              })
            )}
            <SaveViewButton
              view={view}
              payload={{
                topic,
                mode,
                hours,
                min_severity: minSeverity,
              }}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {severityStops.map((sev) => (
            <a
              key={sev}
              href={qp(mode, topic, view, sev)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                sev === minSeverity
                  ? 'border-brand-500/40 bg-brand-500/15 text-brand-200'
                  : 'border-white/10 text-white/65 hover:border-white/25 hover:text-white'
              }`}
            >
              {sev === 0 ? 'All severities' : `Severity ${sev}+`}
            </a>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/55">
          <span>
            Showing <strong className="text-white/80">{signals.length}</strong> signal
            {signals.length === 1 ? '' : 's'}
          </span>
          <span aria-hidden="true">·</span>
          <span>past {hours}h</span>
          <span aria-hidden="true">·</span>
          <span>view: {view}</span>
          {minSeverity > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>sev {minSeverity}+</span>
            </>
          )}
          {topic !== 'all' && (
            <>
              <span aria-hidden="true">·</span>
              <span>topic: {topic}</span>
            </>
          )}
        </div>
      </header>

      {error && <p className="text-sm text-danger-400">Error: {error.message}</p>}

      {signals.length === 0 ? (
        <EmptyState
          icon="∅"
          title="No signals in this window."
          body={
            mode === 'personalized'
              ? 'Try widening your filters or switching to Global feed.'
              : 'Ingestion runs hourly. Check back soon.'
          }
          action={
            mode === 'personalized' && userId
              ? { label: 'Show global feed', href: qp('global', topic) }
              : undefined
          }
        />
      ) : view === 'map' ? (
        <div className="space-y-3">
          <SignalsMap
            points={geoPoints}
            context="feed"
            mapHeightClass="h-[42vh] min-h-[260px] sm:h-[52vh] sm:min-h-[360px]"
            emptyMessage="No mappable signals in this filter window yet."
          />
          <div className="rounded-card border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60">
            Tip: markers without exact coordinates are placed at country centroids and labeled as approximate.
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {signals.map((s) => (
            <li key={s.id}>
              <SignalCard s={s as any} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return 48;
  return Math.max(lo, Math.min(hi, n));
}

function parseMode(mode: string | undefined): FeedMode | null {
  if (!mode) return null;
  return MODES.includes(mode as FeedMode) ? (mode as FeedMode) : null;
}

function parseView(view: string | undefined): FeedView | null {
  if (!view) return null;
  return VIEWS.includes(view as FeedView) ? (view as FeedView) : null;
}

function SaveViewButton({
  view,
  payload,
}: {
  view: FeedView;
  payload: Record<string, unknown>;
}) {
  return (
    <form action="/api/saved-views" method="post" className="inline">
      <input type="hidden" name="name" value={`Feed · ${String(payload.topic ?? 'all')}`} />
      <input type="hidden" name="context" value="feed" />
      <input type="hidden" name="view_mode" value={view} />
      <input type="hidden" name="filters" value={JSON.stringify(payload)} />
      <button
        type="submit"
        className="rounded-full border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-brand-200 hover:bg-brand-500/20"
      >
        Save current view
      </button>
    </form>
  );
}

