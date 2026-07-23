import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase-server';
import { PersonalizedBriefingPanel } from '@/components/personalized-briefing-panel';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
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

  const [{ data: globalBriefings }] = await Promise.all([
    sb
      .from('briefings')
      .select('id, kind, period_start, headline, topics')
      .order('period_start', { ascending: false })
      .limit(20),
  ]);

  if (userId) {
    void logProductEvent(sb, {
      userId,
      eventName: 'briefing_opened',
      eventProps: { mode, global_count: globalBriefings?.length ?? 0 },
    });
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero header with clear visual hierarchy */}
      <header className="relative overflow-hidden rounded-card border border-amber-200/60 bg-gradient-to-br from-amber-50/80 via-paper to-paper p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-200/30 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                Intelligence briefings
              </p>
              <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]">
                {mode === 'my' ? 'Your personal briefing' : 'Global briefing stream'}
              </h1>
              <p className="mt-2 text-sm text-ink-500">
                {mode === 'my'
                  ? 'Tuned to your topics, countries, and source settings. AI-structured into supported, disputed, changed, and watch sections.'
                  : 'Platform-wide coverage across all monitored sources and topics.'}
              </p>
            </div>

            {userId && (
              <nav className="flex shrink-0 gap-1 rounded-full border border-ink-100 bg-paper/80 p-1 shadow-sm backdrop-blur-sm">
                <Link
                  href="/briefings?mode=my"
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    mode === 'my'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-ink-500 hover:bg-ink-100 hover:text-ink'
                  }`}
                >
                  My briefing
                </Link>
                <Link
                  href="/briefings?mode=global"
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    mode === 'global'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-ink-500 hover:bg-ink-100 hover:text-ink'
                  }`}
                >
                  Global
                </Link>
              </nav>
            )}
          </div>

          {!userId && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-ink-100 bg-paper/60 px-4 py-3">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-ink-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <p className="text-sm text-ink-500">
                <Link href="/login?next=/briefings" className="font-medium text-amber-700 hover:text-amber-800">Sign in</Link> for a personalized AI briefing tuned to your interests.
              </p>
            </div>
          )}
        </div>
      </header>

      {/* Personal briefing panel — given breathing room */}
      {mode === 'my' && userId && (
        <div className="space-y-6">
          <PersonalizedBriefingPanel />
          <Link
            href="/feed"
            className="inline-flex rounded-xl border border-ink-100 bg-paper px-4 py-2.5 text-sm font-semibold text-signal hover:border-signal/30"
          >
            Explore the live feed →
          </Link>
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
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-600">
              Global briefings
            </h2>
            {globalBriefings && globalBriefings.length > 0 && (
              <span className="rounded-full border border-ink-100 bg-paper px-2.5 py-0.5 text-[11px] font-medium text-ink-500">
                {globalBriefings.length} briefing{globalBriefings.length === 1 ? '' : 's'}
              </span>
            )}
          </header>
          {globalBriefings == null || globalBriefings.length === 0 ? (
            <EmptyState
              title="No briefings yet."
              body="The first daily briefing runs after the first ingest cycle completes."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {globalBriefings.map((b: any) => (
                <li key={b.id}>
                  <Link
                    href={`/briefings/${b.id}`}
                    className="group block rounded-card border border-ink-100 bg-paper p-5 shadow-card transition hover:border-ink-200 hover:shadow-card-hover"
                  >
                    <div className="flex items-center gap-2 text-xs text-ink-500">
                      <Badge variant="neutral" withIcon={false}>
                        {b.kind}
                      </Badge>
                      <span>{new Date(b.period_start).toLocaleString()}</span>
                    </div>
                    <h3 className="mt-2.5 text-base font-semibold text-ink group-hover:text-amber-700 clamp-2">
                      {b.headline}
                    </h3>
                    {(b.topics ?? []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(b.topics as string[]).slice(0, 4).map((t: string) => (
                          <span
                            key={t}
                            className="rounded-full border border-ink-100 bg-canvas-50 px-2 py-0.5 text-[10px] font-medium capitalize text-ink-500"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
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
