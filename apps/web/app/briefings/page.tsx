import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase-server';
import { PersonalizedBriefingPanel } from '@/components/personalized-briefing-panel';
import { logProductEvent } from '@/lib/product-events';

export const metadata = { title: 'Briefings · OSINT Platform' };
export const revalidate = 120;

const MODES = ['my', 'global'] as const;
type BriefingMode = (typeof MODES)[number];

export default async function BriefingsPage({
  searchParams,
}: {
  searchParams: { mode?: string };
}) {
  const requestedMode = parseMode(searchParams.mode);
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id ?? null;
  const mode: BriefingMode = userId ? requestedMode ?? 'my' : 'global';

  const [{ data: globalBriefings }, { data: prefs }, { data: signals }] = await Promise.all([
    sb
      .from('briefings')
      .select('id, kind, period_start, headline, topics')
      .order('period_start', { ascending: false })
      .limit(20),
    userId
      ? sb.from('preferences').select('topics, muted_sources, muted_topics').eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
    userId
      ? sb
          .from('signals_public')
          .select('id, title, topic, severity, confidence, source_id, first_seen_at')
          .order('severity', { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] }),
  ]);

  const personalizedSignals = userId ? personalizeSignals(signals ?? [], prefs) : [];

  if (userId) {
    void logProductEvent(sb, {
      userId,
      eventName: 'briefing_opened',
      eventProps: { mode, global_count: globalBriefings?.length ?? 0 },
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Briefings</h1>
          <p className="text-sm text-white/60">
            Personal briefing is tuned to your settings. Global briefing shows platform-wide coverage.
          </p>
          {!userId && (
            <p className="mt-1 text-xs text-white/45">
              Public view: these briefings are global and not connected to any user profile.
            </p>
          )}
        </div>
        {userId && (
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/briefings?mode=my"
              className={`rounded border px-3 py-1 ${
                mode === 'my'
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-white/10 text-white/60 hover:border-white/20 hover:text-white'
              }`}
            >
              My briefing
            </Link>
            <Link
              href="/briefings?mode=global"
              className={`rounded border px-3 py-1 ${
                mode === 'global'
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-white/10 text-white/60 hover:border-white/20 hover:text-white'
              }`}
            >
              Global briefing
            </Link>
          </div>
        )}
      </header>

      {mode === 'my' ? (
        userId ? (
          <div className="space-y-4">
            <PersonalizedBriefingPanel />
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-sm font-semibold">Top signals in your current brief context</h2>
              <p className="mt-1 text-xs text-white/50">
                This preview reflects your topics and mute settings. It helps you verify personalization at a glance.
              </p>
              {personalizedSignals.length === 0 ? (
                <p className="mt-3 text-sm text-white/60">
                  No personalized signals found yet for your current filters.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {personalizedSignals.slice(0, 8).map((s) => (
                    <li key={s.id} className="rounded border border-white/10 bg-white/[0.02] p-3">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="mt-1 text-xs text-white/60">
                        {s.topic} · severity {s.severity} · confidence {s.confidence}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
            Sign in to generate a personalized briefing. You can still read the global briefing stream.
          </div>
        )
      ) : null}

      {(mode === 'global' || !userId) &&
        (globalBriefings == null || globalBriefings.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
            No briefings yet. The first daily briefing runs after your first ingest cycle completes.
          </div>
        ) : (
          <ul className="space-y-3">
            {globalBriefings.map((b: any) => (
              <li key={b.id}>
                <Link
                  href={`/briefings/${b.id}`}
                  className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <span className="rounded border border-white/15 px-2 py-0.5 uppercase">{b.kind}</span>
                    <span>{new Date(b.period_start).toLocaleString()}</span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold">{b.headline}</h3>
                  <p className="mt-1 text-xs text-white/50">{(b.topics ?? []).join(' · ')}</p>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function parseMode(mode: string | undefined): BriefingMode | null {
  if (!mode) return null;
  return MODES.includes(mode as BriefingMode) ? (mode as BriefingMode) : null;
}

function personalizeSignals(
  signals: Array<{
    id: string;
    title: string;
    topic: string | null;
    severity: number;
    confidence: number;
    source_id: string | null;
  }>,
  prefs:
    | {
        topics?: string[] | null;
        muted_sources?: string[] | null;
        muted_topics?: string[] | null;
      }
    | null,
) {
  const focusTopics = new Set((prefs?.topics ?? []).map(String));
  const mutedTopics = new Set((prefs?.muted_topics ?? []).map(String));
  const mutedSources = new Set((prefs?.muted_sources ?? []).map(String));
  return signals
    .filter((s) => !s.source_id || !mutedSources.has(String(s.source_id)))
    .filter((s) => !mutedTopics.has(String(s.topic ?? 'other')))
    .filter((s) => (focusTopics.size === 0 ? true : focusTopics.has(String(s.topic ?? 'other'))))
    .sort((a, b) => Number(b.severity ?? 0) - Number(a.severity ?? 0));
}
