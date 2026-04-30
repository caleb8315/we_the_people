import Link from 'next/link';
import { headers } from 'next/headers';
import { getServerSupabase } from '@/lib/supabase-server';
import { SignalCard } from '@/components/signal-card';
import { Segmented } from '@/components/ui/segmented';
import { ChipRow } from '@/components/ui/chip-row';
import { EmptyState } from '@/components/ui/empty-state';
import { SignalsMap } from '@/components/signals-map';
import { logProductEvent } from '@/lib/product-events';
import { applyMutes, decorateSignals, personalizeSignals, type SignalRowRaw } from '@/lib/signals';
import { signalGeoPoint, type SignalGeoPoint } from '@/lib/signal-geo';

export const metadata = { title: 'Feed · Crosscheck' };
export const dynamic = 'force-dynamic';

const TOPICS = ['all', 'war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster', 'tech', 'finance'] as const;
const MODES = ['personalized', 'global'] as const;
const VIEWS = ['list', 'map'] as const;
type FeedMode = (typeof MODES)[number];
type FeedView = (typeof VIEWS)[number];

interface SavedViewRow {
  id: string;
  name: string;
  context: string;
  view_mode: string;
  filters: Record<string, unknown> | null;
  updated_at: string;
}

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
  const userName = (() => {
    const meta = (auth.user?.user_metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.full_name === 'string' && meta.full_name) return meta.full_name as string;
    if (typeof meta.name === 'string' && meta.name) return meta.name as string;
    return auth.user?.email?.split('@')[0] ?? null;
  })();

  const [{ data: prefs }, { data: savedViews }] = await Promise.all([
    userId
      ? sb
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

  const mutedTopicsList: string[] = (prefs?.muted_topics ?? []) as string[];
  const mutedSourcesList: string[] = (prefs?.muted_sources ?? []) as string[];
  const focusTopicsList: string[] = (prefs?.topics ?? []) as string[];
  const countriesList: string[] = (prefs?.countries_of_focus ?? []) as string[];

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

  // Filter muted topics at the DB level so they never reach the client
  if (userId && mutedTopicsList.length > 0) {
    for (const mt of mutedTopicsList) {
      q = q.neq('topic', mt);
    }
  }

  // In personalized mode, filter to focus topics at DB level
  if (mode === 'personalized' && focusTopicsList.length > 0) {
    q = q.in('topic', focusTopicsList);
  }

  const { data, error } = await q;
  const nowIso = new Date().toISOString();
  const allSignals = ((data ?? []) as Array<SignalRowRaw & { expires_at?: string | null }>).filter(
    (s) => !s.expires_at || s.expires_at > nowIso,
  );
  // Apply remaining filters (muted sources, countries) in JS
  const filtered = userId
    ? applyMutes(allSignals, prefs)
    : allSignals;
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
      eventProps: {
        context: 'feed',
        depth_bucket: signals.length >= 25 ? 'deep' : signals.length >= 10 ? 'mid' : 'shallow',
      },
    });
  }

  const qp = (m: string, t: string, v: FeedView = view, sev: number = minSeverity) =>
    `/feed?mode=${m}&topic=${t}&hours=${hours}&view=${v}&min_severity=${sev}`;
  const severityStops = [0, 60, 75, 85] as const;

  return (
    <div className="space-y-6 sm:space-y-7">
      {/* Greeting hero — mirrors the reference "let's go trip to africa" header. */}
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
          {userName ? `Hello, ${userName}` : 'Live coverage'}
        </p>
        <h1 className="mt-2 max-w-2xl text-[34px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[44px]">
          what&apos;s moving
          <br />
          <span className="text-ink-500">the world right now.</span>
        </h1>

        {/* Search + filter button. The amber square on the right matches the
            reference's filter affordance. */}
        <form action="/feed" className="mt-5 flex max-w-xl items-center gap-3">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-ink-100 bg-paper px-4 py-3 shadow-card">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-ink-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              name="topic"
              type="search"
              defaultValue={topic !== 'all' ? topic : ''}
              placeholder="Search topics, countries, outlets"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-400 focus:outline-none"
            />
            <input type="hidden" name="hours" value={String(hours)} />
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="mode" value={mode} />
          </label>
          <button
            type="submit"
            aria-label="Apply search"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-[0_8px_20px_-6px_rgba(245,158,11,0.55)] hover:bg-amber-600"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="7" y1="12" x2="17" y2="12" />
              <line x1="10" y1="18" x2="14" y2="18" />
            </svg>
          </button>
        </form>
      </section>

      {/* Topic browser row. */}
      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">Topics</h2>
            <p className="mt-0.5 text-sm text-ink-500">
              Filter the feed by the category you care about.
            </p>
          </div>
          {topic !== 'all' && (
            <Link
              href={qp(mode, 'all')}
              className="text-sm font-semibold text-amber-600 hover:text-amber-700"
            >
              Clear
            </Link>
          )}
        </div>
        <div className="mt-3">
          <ChipRow
            active={topic}
            options={TOPICS.map((t) => ({ label: t, value: t, href: qp(mode, t) }))}
            onClear={undefined}
          />
        </div>
      </section>

      {/* Results header — mode / view / severity + count summary. */}
      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">
              {mode === 'personalized' ? 'Your feed' : 'Global feed'}
            </h2>
            <p className="mt-0.5 text-sm text-ink-500">
              <strong className="text-ink-700">{signals.length}</strong> signal
              {signals.length === 1 ? '' : 's'} · past {hours}h
              {topic !== 'all' && <> · topic: {topic}</>}
              {minSeverity > 0 && <> · severity {minSeverity}+</>}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            {userId && (
              <Segmented
                ariaLabel="Feed mode"
                className="w-full sm:w-auto"
                active={mode}
                options={[
                  { label: 'My feed', value: 'personalized', href: qp('personalized', topic) },
                  { label: 'Global', value: 'global', href: qp('global', topic) },
                ]}
              />
            )}
            <Segmented
              ariaLabel="Feed view"
              className="w-full sm:w-auto"
              active={view}
              options={[
                { label: 'List', value: 'list', href: qp(mode, topic, 'list') },
                { label: `Map (${geoPoints.length})`, value: 'map', href: qp(mode, topic, 'map') },
              ]}
            />
            <Link
              href="/briefings"
              className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-ink-100 bg-paper px-3.5 py-1.5 text-sm text-ink-600 hover:border-ink-200 hover:text-ink sm:min-h-0"
            >
              Briefings
            </Link>
          </div>
        </div>

        <div className="mt-3 -mx-1 overflow-x-auto pb-1">
          <div className="flex w-max gap-2 px-1">
            {severityStops.map((sev) => (
              <a
                key={sev}
                href={qp(mode, topic, view, sev)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  sev === minSeverity
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-100 bg-paper text-ink-500 hover:border-ink-200 hover:text-ink'
                }`}
              >
                {sev === 0 ? 'All severities' : `Severity ${sev}+`}
              </a>
            ))}
          </div>
        </div>

        {userId && (savedViews ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>Saved views:</span>
            {(savedViews ?? []).map((sv: SavedViewRow) => {
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
                  className="rounded-full border border-ink-100 bg-paper px-2.5 py-1 text-ink-600 hover:border-ink-200 hover:text-ink"
                >
                  {sv.name}
                </Link>
              );
            })}
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
      </section>

      {error && <p className="text-sm text-danger-600">Error: {error.message}</p>}

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
          <div className="rounded-card border border-ink-100 bg-paper p-3 text-xs text-ink-500 shadow-card">
            Tip: markers without exact coordinates are placed at country centroids and labeled as
            approximate.
          </div>
        </div>
      ) : (
        <ul className="space-y-4">
          {signals.map((s) => (
            <li key={s.id}>
              <SignalCard s={s} />
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
        className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-medium text-amber-700 hover:bg-amber-100"
      >
        Save current view
      </button>
    </form>
  );
}
