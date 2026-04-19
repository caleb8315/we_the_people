import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata = { title: 'Intel Workspace · OSINT Platform' };
export const dynamic = 'force-dynamic';

export default async function IntelWorkspacePage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/dashboard/intel');

  const { data: profile } = await sb
    .from('profiles')
    .select('onboarded_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect('/onboarding');

  const [{ data: prefs }, { data: signals }] = await Promise.all([
    sb.from('preferences').select('topics, min_alert_severity').eq('user_id', auth.user.id).maybeSingle(),
    sb
      .from('signals_public')
      .select('id, title, topic, severity, confidence, verification_status, first_seen_at')
      .in('verification_status', ['verified', 'developing'])
      .gte('severity', 60)
      .order('severity', { ascending: false })
      .limit(80),
  ]);

  const focusTopics = new Set((prefs?.topics ?? ['war', 'economy', 'climate']) as string[]);
  const prioritized = (signals ?? []).filter((s) => focusTopics.has(s.topic ?? 'other'));
  const overflow = (signals ?? []).filter((s) => !focusTopics.has(s.topic ?? 'other'));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Intel workspace</h1>
        <p className="text-sm text-white/60">
          Prioritized by your focus topics and verification quality. Alert threshold: {prefs?.min_alert_severity ?? 70}.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/70">Priority queue</h2>
        <SignalList rows={prioritized} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/70">Additional global signals</h2>
        <SignalList rows={overflow} />
      </section>
    </div>
  );
}

function SignalList({ rows }: { rows: Array<any> }) {
  if (!rows || rows.length === 0) {
    return <p className="rounded border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">No signals in this bucket.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.slice(0, 25).map((s) => (
        <li key={s.id} className="flex items-center justify-between rounded border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="min-w-0">
            <Link href={`/signal/${s.id}`} className="truncate text-sm hover:underline">
              {s.title}
            </Link>
            <div className="text-xs text-white/50">
              {s.topic} · {s.verification_status} · {new Date(s.first_seen_at).toLocaleString()}
            </div>
          </div>
          <div className="text-xs text-white/60">sev {s.severity} · conf {s.confidence}</div>
        </li>
      ))}
    </ul>
  );
}
