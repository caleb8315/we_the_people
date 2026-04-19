import Link from 'next/link';
import { getAdminSupabase } from '@/lib/supabase-server';

export const metadata = { title: 'Briefings · OSINT Platform' };
export const revalidate = 120;

export default async function BriefingsPage() {
  const sb = getAdminSupabase();
  const { data } = await sb
    .from('briefings')
    .select('id, kind, period_start, headline, topics')
    .order('period_start', { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Briefings</h1>
        <p className="text-sm text-white/60">Daily and weekly synthesis of verified signals.</p>
      </header>
      {(!data || data.length === 0) ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
          No briefings yet. The first daily briefing runs after your first ingest cycle completes.
        </div>
      ) : (
        <ul className="space-y-3">
          {data.map((b: any) => (
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
      )}
    </div>
  );
}
