import { getServerSupabase } from '@/lib/supabase-server';
import { SignalCard } from '@/components/signal-card';
import { Segmented } from '@/components/ui/segmented';
import { ChipRow } from '@/components/ui/chip-row';
import { EmptyState } from '@/components/ui/empty-state';
import { logProductEvent } from '@/lib/product-events';
import { decorateSignals, personalizeSignals, type SignalRowRaw } from '@/lib/signals';

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
        .select('topics, muted_sources, muted_topics, countries_of_focus, feed_mode_preference')
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
  const allSignals = (data ?? []) as SignalRowRaw[];
  const filtered = mode === 'personalized' ? personalizeSignals(allSignals, prefs) : allSignals;
  const signals = await decorateSignals(sb, filtered);

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

  const qp = (m: string, t: string) => `/feed?mode=${m}&topic=${t}&hours=${hours}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
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
            <Segmented
              ariaLabel="Feed mode"
              active={mode}
              options={[
                { label: 'My feed', value: 'personalized', href: qp('personalized', topic) },
                { label: 'Global feed', value: 'global', href: qp('global', topic) },
              ]}
            />
          )}
        </div>

        <ChipRow
          active={topic}
          options={TOPICS.map((t) => ({ label: t, value: t, href: qp(mode, t) }))}
          onClear={undefined}
        />

        <div className="flex items-center gap-3 text-xs text-white/55">
          <span>
            Showing <strong className="text-white/80">{signals.length}</strong> signal
            {signals.length === 1 ? '' : 's'}
          </span>
          <span aria-hidden="true">·</span>
          <span>past {hours}h</span>
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
