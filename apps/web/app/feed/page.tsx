import Link from 'next/link';
import { getAdminSupabase } from '@/lib/supabase-server';
import { SignalCard, type SignalRow } from '@/components/signal-card';

export const metadata = { title: 'Feed · OSINT Platform' };
export const revalidate = 60;

const TOPICS = ['all', 'war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster'] as const;

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { topic?: string; hours?: string };
}) {
  const topic = (searchParams.topic ?? 'all').toLowerCase();
  const hours = clamp(Number(searchParams.hours ?? '48'), 1, 24 * 14);

  const sb = getAdminSupabase();
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  let q = sb
    .from('signals_public')
    .select('*')
    .gte('first_seen_at', since)
    .order('severity', { ascending: false })
    .limit(80);
  if (topic !== 'all') q = q.eq('topic', topic);

  const { data, error } = await q;
  const signals = (data ?? []) as SignalRow[];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live feed</h1>
          <p className="text-sm text-white/60">
            Ranked by severity. Verified and developing only. Past {hours}h.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {TOPICS.map(t => (
            <Link
              key={t}
              href={`/feed?topic=${t}&hours=${hours}`}
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
