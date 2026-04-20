import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase-server';
import { PersonalizedBriefingPanel } from '@/components/personalized-briefing-panel';
import { Segmented } from '@/components/ui/segmented';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SignalCard } from '@/components/signal-card';
import { decorateSignals, personalizeSignals, type SignalRowRaw } from '@/lib/signals';
import { logProductEvent } from '@/lib/product-events';

export const metadata = { title: 'Briefings · Crosscheck' };
export const revalidate = 120;

const MODES = ['my', 'global'] as const;
type BriefingMode = (typeof MODES)[number];

export default async function BriefingsPage({ searchParams }: { searchParams: { mode?: string } }) {
  const requestedMode = parseMode(searchParams.mode);
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id ?? null;
  const mode: BriefingMode = userId ? requestedMode ?? 'my' : 'global';

  const [{ data: globalBriefings }, { data: prefs }, { data: rawSignals }] = await Promise.all([
    sb
      .from('briefings')
      .select('id, kind, period_start, headline, topics')
      .order('period_start', { ascending: false })
      .limit(20),
    userId
      ? sb
          .from('preferences')
          .select('topics, muted_sources, muted_topics, countries_of_focus')
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    userId
      ? sb
          .from('signals_public')
          .select('*')
          .order('severity', { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] }),
  ]);

  const personalized = userId
    ? await decorateSignals(sb, personalizeSignals(((rawSignals ?? []) as SignalRowRaw[]), prefs).slice(0, 12))
    : [];

  if (userId) {
    void logProductEvent(sb, {
      userId,
      eventName: 'briefing_opened',
      eventProps: { mode, global_count: globalBriefings?.length ?? 0 },
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Briefings</h1>
            <p className="mt-1 text-sm text-white/60">
              Personal briefing is tuned to your settings. Global briefing shows platform-wide coverage.
            </p>
            {!userId && (
              <p className="mt-1 text-xs text-white/45">
                Public view: these briefings are global and not connected to any user profile.
              </p>
            )}
          </div>

          {userId && (
            <Segmented
              ariaLabel="Briefing mode"
              active={mode}
              options={[
                { label: 'My briefing', value: 'my', href: '/briefings?mode=my' },
                { label: 'Global briefing', value: 'global', href: '/briefings?mode=global' },
              ]}
            />
          )}
        </div>
      </header>

      {mode === 'my' && userId && (
        <div className="space-y-4">
          <PersonalizedBriefingPanel />

          <Card
            title="Top signals in your current brief context"
            action={
              <Link href="/feed" className="text-xs text-brand-300 hover:underline">
                Open my feed
              </Link>
            }
          >
            <p className="-mt-2 mb-3 text-xs text-white/55">
              Preview reflects your topics and mute settings so you can confirm personalization at a glance.
            </p>
            {personalized.length === 0 ? (
              <EmptyState
                title="No personalized signals right now."
                body="Try widening your topics or checking the global briefing."
                action={{ label: 'See global briefing', href: '/briefings?mode=global' }}
              />
            ) : (
              <ul className="space-y-3">
                {personalized.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <SignalCard s={s as any} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {mode === 'my' && !userId && (
        <EmptyState
          title="Sign in for a personalized briefing."
          body="You can still read the global briefing stream."
          action={{ label: 'Read global briefing', href: '/briefings?mode=global' }}
        />
      )}

      {(mode === 'global' || !userId) && (
        <section>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">Global briefings</h2>
          </header>
          {globalBriefings == null || globalBriefings.length === 0 ? (
            <EmptyState
              title="No briefings yet."
              body="The first daily briefing runs after the first ingest cycle completes."
            />
          ) : (
            <ul className="space-y-3">
              {globalBriefings.map((b: any) => (
                <li key={b.id}>
                  <Link
                    href={`/briefings/${b.id}`}
                    className="block rounded-card border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center gap-2 text-xs text-white/60">
                      <Badge variant="neutral" withIcon={false}>
                        {b.kind}
                      </Badge>
                      <span>{new Date(b.period_start).toLocaleString()}</span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold clamp-2">{b.headline}</h3>
                    <p className="mt-1 text-xs text-white/50">{(b.topics ?? []).join(' · ')}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function parseMode(mode: string | undefined): BriefingMode | null {
  if (!mode) return null;
  return MODES.includes(mode as BriefingMode) ? (mode as BriefingMode) : null;
}
