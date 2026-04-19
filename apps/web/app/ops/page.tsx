import { redirect } from 'next/navigation';
import { getAdminSupabase, getServerSupabase } from '@/lib/supabase-server';
import { isAdminEmail } from '@/lib/admin';
import { StatTile } from '@/components/ui/stat-tile';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Ops · OSINT Platform' };
export const dynamic = 'force-dynamic';

export default async function OpsPage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/ops');
  if (!isAdminEmail(auth.user.email)) {
    return <p className="text-sm text-white/70">You are signed in, but this page is restricted to operators.</p>;
  }

  const admin = getAdminSupabase();
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [
    { data: runs },
    { data: usage },
    { count: signalCount },
    { count: briefingCount },
    { data: uxEvents },
  ] = await Promise.all([
    admin.from('engine_runs').select('*').gte('started_at', since).order('started_at', { ascending: false }).limit(50),
    admin.from('usage_ledger').select('bucket, calls').eq('day', today),
    admin.from('signals').select('id', { count: 'exact', head: true }),
    admin.from('briefings').select('id', { count: 'exact', head: true }),
    admin
      .from('product_events')
      .select('event_name, event_props')
      .gte('created_at', weekAgo)
      .in('event_name', [
        'feed_viewed',
        'map_opened',
        'signal_opened_from_map',
        'mobile_nav_used',
        'saved_view_applied',
      ]),
  ]);

  const usageByBucket = new Map<string, number>();
  for (const r of usage ?? []) {
    usageByBucket.set(r.bucket, (usageByBucket.get(r.bucket) ?? 0) + r.calls);
  }
  const events = (uxEvents ?? []) as Array<{ event_name: string; event_props?: Record<string, unknown> | null }>;
  const feedViews = events.filter((e) => e.event_name === 'feed_viewed');
  const mapOpenCount = events.filter((e) => e.event_name === 'map_opened').length;
  const mapSignalOpenCount = events.filter((e) => e.event_name === 'signal_opened_from_map').length;
  const mobileNavCount = events.filter((e) => e.event_name === 'mobile_nav_used').length;
  const savedViewCount = events.filter((e) => e.event_name === 'saved_view_applied').length;
  const mapViewRate =
    feedViews.length === 0
      ? 0
      : Math.round(
          (100 * feedViews.filter((e) => String(e.event_props?.view ?? '') === 'map').length) / feedViews.length,
        );
  const mobileFeedRate =
    feedViews.length === 0
      ? 0
      : Math.round(
          (100 * feedViews.filter((e) => Boolean(e.event_props?.is_mobile)).length) / feedViews.length,
        );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ops dashboard</h1>
          <p className="text-sm text-white/60">Observability for ingest / brief / alert workers.</p>
        </div>
        <a
          href="/ops/requests"
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          Access requests →
        </a>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Signals (total)" value={(signalCount ?? 0).toLocaleString()} />
        <StatTile label="Briefings (total)" value={(briefingCount ?? 0).toLocaleString()} />
        <StatTile
          label="LLM calls today"
          value={[...usageByBucket.values()].reduce((a, b) => a + b, 0).toLocaleString()}
        />
        <StatTile label="Buckets used" value={usageByBucket.size} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Map feed share (7d)" value={`${mapViewRate}%`} hint="feed_viewed events in map mode" />
        <StatTile label="Map opened (7d)" value={mapOpenCount} hint="feed + intel map sessions" />
        <StatTile label="Map signal opens (7d)" value={mapSignalOpenCount} hint="signal_opened_from_map" />
        <StatTile label="Mobile feed share (7d)" value={`${mobileFeedRate}%`} hint="feed_viewed from mobile UA" />
        <StatTile label="Saved views (7d)" value={savedViewCount} hint="saved_view_applied events" />
      </section>

      <Card title="UX validation hints">
        <ul className="space-y-1 text-sm text-white/70">
          <li>
            Map discoverability is healthy if map feed share reaches at least <strong className="text-white">20%</strong> in
            early cohorts.
          </li>
          <li>
            Map utility improves when <strong className="text-white">signal_opened_from_map / map_opened</strong> trends up.
          </li>
          <li>
            Mobile UX should increase mobile feed share and keep useful-alert ratio above guardrail.
          </li>
        </ul>
      </Card>

      <Card title="Usage today">
        {usageByBucket.size === 0 ? (
          <p className="text-sm text-white/55">No LLM calls logged today.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-3">
            {[...usageByBucket.entries()].map(([b, c]) => (
              <li key={b} className="rounded-md border border-white/10 p-3">
                <div className="text-xs uppercase tracking-wide text-white/55">{b}</div>
                <div className="text-lg font-semibold tabular-nums">{c}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/60">Recent engine runs</h2>
        <div className="overflow-x-auto rounded-card border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.05] text-left text-white/60">
              <tr>
                <th className="p-2">Started</th>
                <th className="p-2">Job</th>
                <th className="p-2">Status</th>
                <th className="p-2">In</th>
                <th className="p-2">Out</th>
                <th className="p-2">Errors</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-2 font-mono text-xs text-white/70">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="p-2">{r.job}</td>
                  <td className="p-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${statusClass(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="p-2">{r.records_in}</td>
                  <td className="p-2">{r.records_out}</td>
                  <td className="p-2 text-xs text-white/60">
                    {(r.errors ?? []).length > 0 ? r.errors[0] : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function statusClass(s: string): string {
  if (s === 'success') return 'bg-brand-500/15 text-brand-300';
  if (s === 'partial') return 'bg-warn-500/15 text-warn-400';
  if (s === 'failed') return 'bg-danger-500/15 text-danger-400';
  return 'bg-white/10 text-white/60';
}
