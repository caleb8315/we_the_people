import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase-server';
import { SignalCard, type SignalRow } from '@/components/signal-card';
import { logProductEvent } from '@/lib/product-events';

export const metadata = { title: 'Feed · OSINT Platform' };
export const revalidate = 60;

const TOPICS = ['all', 'war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster'] as const;
const MODES = ['personalized', 'global'] as const;
type FeedMode = (typeof MODES)[number];

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { topic?: string; hours?: string; mode?: string };
}) {
  const topic = (searchParams.topic ?? 'all').toLowerCase();
  const hours = clamp(Number(searchParams.hours ?? '48'), 1, 24 * 14);
  const requestedMode = parseMode(searchParams.mode);

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id ?? null;

  const { data: prefs } = userId
    ? await sb
        .from('preferences')
        .select(
          'topics, muted_sources, muted_topics, countries_of_focus, feed_mode_preference, min_alert_severity',
        )
        .eq('user_id', userId)
        .maybeSingle()
    : { data: null };

  const defaultMode: FeedMode = prefs?.feed_mode_preference === 'global' ? 'global' : 'personalized';
  const mode: FeedMode = userId ? requestedMode ?? defaultMode : 'global';
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  let q = sb
    .from('signals_public')
    .select('*')
    .gte('first_seen_at', since)
    .order('severity', { ascending: false })
    .limit(80);
  if (topic !== 'all') q = q.eq('topic', topic);

  const { data, error } = await q;
  const allSignals = (data ?? []) as SignalRow[];
  const signals = mode === 'personalized' ? personalizeSignals(allSignals, prefs) : allSignals;

  if (userId) {
    void logProductEvent(sb, {
      userId,
      eventName: 'feed_viewed',
      eventProps: {
        mode,
        topic,
        hours,
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
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live feed</h1>
          <p className="text-sm text-white/60">
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
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/feed?mode=personalized&topic=${topic}&hours=${hours}`}
              className={`rounded border px-3 py-1 ${
                mode === 'personalized'
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-white/10 text-white/60 hover:border-white/20 hover:text-white'
              }`}
            >
              My feed
            </Link>
            <Link
              href={`/feed?mode=global&topic=${topic}&hours=${hours}`}
              className={`rounded border px-3 py-1 ${
                mode === 'global'
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-white/10 text-white/60 hover:border-white/20 hover:text-white'
              }`}
            >
              Global feed
            </Link>
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-sm">
          {TOPICS.map(t => (
            <Link
              key={t}
              href={`/feed?mode=${mode}&topic=${t}&hours=${hours}`}
              className={`rounded border px-3 py-1 capitalize ${
                t === topic
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-white/10 text-white/60 hover:border-white/20 hover:text-white'
              }`}
            >
              {t}
            </Link>
          ))}
        </div>
      </header>

      {error && <p className="text-sm text-red-300">Error: {error.message}</p>}

      {signals.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
          No signals in this window yet. Ingestion runs hourly.
        </div>
      ) : (
        <ul className="space-y-3">
          {signals.map(s => (
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

function personalizeSignals(
  signals: SignalRow[],
  prefs:
    | {
        topics?: string[] | null;
        muted_sources?: string[] | null;
        muted_topics?: string[] | null;
        countries_of_focus?: string[] | null;
      }
    | null,
) {
  const focusTopics = new Set((prefs?.topics ?? []).map(String));
  const mutedTopics = new Set((prefs?.muted_topics ?? []).map(String));
  const mutedSources = new Set((prefs?.muted_sources ?? []).map(String));
  const countries = new Set((prefs?.countries_of_focus ?? []).map((c) => String(c).toUpperCase()));

  return signals
    .filter((s) => !s.source_id || !mutedSources.has(String(s.source_id)))
    .filter((s) => !mutedTopics.has(String(s.topic ?? 'other')))
    .filter((s) => (focusTopics.size === 0 ? true : focusTopics.has(String(s.topic ?? 'other'))))
    .filter((s) =>
      countries.size === 0 ? true : countries.has(String(s.country_code ?? '').toUpperCase()),
    );
}
