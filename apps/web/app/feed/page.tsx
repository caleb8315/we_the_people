import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase-server';
import { SignalCard } from '@/components/signal-card';
import { EmptyState } from '@/components/ui/empty-state';
import { decorateSignals, personalizeSignals, type SignalRowRaw } from '@/lib/signals';
import { VerifyInline } from '@/components/verify-inline';

export const metadata = { title: 'Feed · Crosscheck' };
export const revalidate = 60;

const TOPICS = ['all', 'war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster'] as const;

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { topic?: string; hours?: string; mode?: string };
}) {
  const topic = (searchParams.topic ?? 'all').toLowerCase();
  const hours = clamp(Number(searchParams.hours ?? '48'), 1, 336);
  const mode = searchParams.mode ?? 'global';

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id ?? null;

  const [{ data: prefs }] = await Promise.all([
    userId
      ? sb.from('preferences')
          .select('topics, muted_sources, muted_topics, countries_of_focus')
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  let q = sb
    .from('signals')
    .select('id,title,summary,url,topic,country_code,severity,confidence,verification_status,source_count,credible_source_count,distinct_domains,source_id,occurred_at,first_seen_at,raw_data,expires_at')
    .gte('first_seen_at', since)
    .in('verification_status', ['verified', 'developing', 'unverified'])
    .order('severity', { ascending: false })
    .limit(60);
  if (topic !== 'all') q = q.eq('topic', topic);

  const { data, error } = await q;
  const allSignals = ((data ?? []) as Array<SignalRowRaw & { expires_at?: string | null }>)
    .filter(s => !s.expires_at || s.expires_at > nowIso);
  const filtered = mode === 'personalized' && userId
    ? personalizeSignals(allSignals, prefs)
    : allSignals;
  const signals = await decorateSignals(sb, filtered);

  // Split: hero signal (first researched + high severity) and the rest
  const heroSignal = signals.find(s => s.has_deep_dive && s.severity >= 40) ?? null;
  const feedSignals = heroSignal
    ? signals.filter(s => s.id !== heroSignal.id)
    : signals;

  const qp = (t: string) => `/feed?topic=${t}&hours=${hours}&mode=${mode}`;

  return (
    <div className="space-y-8">
      {/* ── Verify bar ─────────────────────────────────────────────── */}
      <VerifyInline />

      {/* ── Hero signal ────────────────────────────────────────────── */}
      {heroSignal && (
        <Link
          href={`/signal/${heroSignal.id}`}
          className="group block overflow-hidden rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-500/[0.08] to-transparent p-5 transition hover:border-brand-500/40 sm:p-6"
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-brand-500/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-400">
              Top researched story
            </span>
            {heroSignal.topic && (
              <span className="text-white/40">{heroSignal.topic}</span>
            )}
            <span className="text-white/30">·</span>
            <span className="text-white/40">
              {heroSignal.source_count} source{heroSignal.source_count === 1 ? '' : 's'}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white group-hover:text-brand-300 sm:text-2xl">
            {heroSignal.title}
          </h2>
          {heroSignal.summary && (
            <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-white/65">
              {heroSignal.summary}
            </p>
          )}
          <p className="mt-3 text-xs text-brand-400 group-hover:underline">
            View full research report →
          </p>
        </Link>
      )}

      {/* ── Topic filters (clean, single row) ──────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {TOPICS.map(t => (
          <a
            key={t}
            href={qp(t)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
              t === topic
                ? 'bg-white text-black font-medium'
                : 'text-white/55 hover:bg-white/10 hover:text-white'
            }`}
          >
            {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
          </a>
        ))}

        {userId && (
          <>
            <span className="mx-1 h-4 w-px bg-white/15" />
            <a
              href={`/feed?topic=${topic}&hours=${hours}&mode=${mode === 'personalized' ? 'global' : 'personalized'}`}
              className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/50 hover:border-white/30 hover:text-white"
            >
              {mode === 'personalized' ? 'Show global' : 'My feed'}
            </a>
          </>
        )}
      </div>

      {/* ── Feed ───────────────────────────────────────────────────── */}
      {error && <p className="text-sm text-red-400">Error loading signals.</p>}

      {feedSignals.length === 0 ? (
        <EmptyState
          icon="∅"
          title="No signals in this window."
          body="The feed updates hourly. Try a different topic or check back soon."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {feedSignals.map(s => (
            <SignalCard key={s.id} s={s as any} />
          ))}
        </div>
      )}

      {/* ── Footer stats (minimal) ─────────────────────────────────── */}
      <p className="text-center text-xs text-white/30">
        {signals.length} signal{signals.length === 1 ? '' : 's'} · past {hours}h
        {topic !== 'all' ? ` · ${topic}` : ''}
      </p>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return 48;
  return Math.max(lo, Math.min(hi, n));
}
