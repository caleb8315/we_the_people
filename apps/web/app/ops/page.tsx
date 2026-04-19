import { redirect } from 'next/navigation';
import { getAdminSupabase, getServerSupabase } from '@/lib/supabase-server';
import { isAdminEmail } from '@/lib/admin';

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

  const [{ data: runs }, { data: usage }, { count: signalCount }, { count: briefingCount }] = await Promise.all([
    admin.from('engine_runs').select('*').gte('started_at', since).order('started_at', { ascending: false }).limit(50),
    admin.from('usage_ledger').select('bucket, calls').eq('day', today),
    admin.from('signals').select('id', { count: 'exact', head: true }),
    admin.from('briefings').select('id', { count: 'exact', head: true }),
  ]);

  const usageByBucket = new Map<string, number>();
  for (const r of usage ?? []) {
    usageByBucket.set(r.bucket, (usageByBucket.get(r.bucket) ?? 0) + r.calls);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ops dashboard</h1>
          <p className="text-sm text-white/60">Observability for ingest / brief / alert workers.</p>
        </div>
        <a
          href="/ops/requests"
          className="rounded border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          Access requests →
        </a>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Signals (total)" value={signalCount ?? 0} />
        <Stat label="Briefings (total)" value={briefingCount ?? 0} />
        <Stat label="LLM calls today" value={[...usageByBucket.values()].reduce((a, b) => a + b, 0)} />
        <Stat label="Buckets used" value={usageByBucket.size} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/70">Usage today</h2>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          {usageByBucket.size === 0 ? (
            <p className="text-white/60">No LLM calls logged today.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-3">
              {[...usageByBucket.entries()].map(([b, c]) => (
                <li key={b} className="rounded border border-white/10 p-3">
                  <div className="text-xs uppercase tracking-wide text-white/60">{b}</div>
                  <div className="text-lg font-semibold">{c}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/70">Recent engine runs</h2>
        <div className="overflow-x-auto rounded-xl border border-white/10">
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}

function statusClass(s: string): string {
  if (s === 'success') return 'bg-emerald-500/15 text-emerald-300';
  if (s === 'partial') return 'bg-amber-500/15 text-amber-300';
  if (s === 'failed') return 'bg-red-500/15 text-red-300';
  return 'bg-white/10 text-white/60';
}
