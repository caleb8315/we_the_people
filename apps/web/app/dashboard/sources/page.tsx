import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { Badge } from '@/components/ui/badge';
import { StatTile } from '@/components/ui/stat-tile';

export const metadata = { title: 'Sources · OSINT Platform' };
export const dynamic = 'force-dynamic';

interface SourceRow {
  id: string;
  name: string;
  kind: string;
  credibility: number;
  metadata: Record<string, unknown> | null;
  enabled: boolean;
}

function groupKey(s: SourceRow): string {
  const kind = String(s.kind ?? '').toLowerCase();
  const type = String((s.metadata as any)?.type ?? '').toLowerCase();
  if (type === 'earthquake' || type === 'natural_events' || type === 'volcano' || type === 'hurricane') return 'science_sensors';
  if (type === 'weather' || type === 'weather_alerts') return 'weather';
  if (type === 'markets') return 'markets';
  if (type === 'cyber') return 'cyber';
  if (type === 'events') return 'events';
  return kind === 'rss' ? 'news_wires' : 'apis';
}

const GROUP_LABELS: Record<string, string> = {
  news_wires: 'News wires',
  science_sensors: 'Science sensors (satellite, seismic, volcano, hurricane)',
  weather: 'Weather and alerts',
  markets: 'Markets and macro',
  cyber: 'Cyber advisories',
  events: 'Global events (GDELT)',
  apis: 'Other APIs',
};

export default async function SourcesPage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/dashboard/sources');
  const { data: profile } = await sb
    .from('profiles')
    .select('onboarded_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect('/onboarding');

  const [{ data: sources }, { data: prefs }] = await Promise.all([
    sb
      .from('sources')
      .select('id, name, kind, credibility, metadata, enabled')
      .eq('enabled', true)
      .order('credibility', { ascending: false }),
    sb.from('preferences').select('muted_sources').eq('user_id', auth.user.id).maybeSingle(),
  ]);

  const muted = new Set((prefs?.muted_sources ?? []) as string[]);
  const rows = (sources ?? []) as SourceRow[];

  const groups = new Map<string, SourceRow[]>();
  for (const s of rows) {
    const key = groupKey(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  const mutedCount = rows.filter((s) => muted.has(s.id)).length;
  const activeCount = rows.length - mutedCount;
  const highCredCount = rows.filter((s) => s.credibility >= 80).length;

  const order = ['news_wires', 'science_sensors', 'weather', 'markets', 'cyber', 'events', 'apis'];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Source control</h1>
        <p className="mt-1 text-sm text-white/60">
          Grouped by type, sorted by credibility. Your muted sources are flagged and excluded from your personal view.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Sources active" value={activeCount} hint={`in your account (of ${rows.length})`} tone="accent" />
        <StatTile label="You have muted" value={mutedCount} tone={mutedCount > 0 ? 'warn' : 'neutral'} />
        <StatTile label="High credibility" value={highCredCount} hint="credibility 80+" />
      </section>

      {order
        .filter((k) => groups.has(k))
        .map((k) => (
          <section key={k}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/70">
              {GROUP_LABELS[k] ?? k}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {groups.get(k)!.map((s) => {
                const isMuted = muted.has(s.id);
                return (
                  <li
                    key={s.id}
                    className={`rounded-card border p-3 text-sm ${
                      isMuted ? 'border-danger-500/25 bg-danger-500/[0.04]' : 'border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium clamp-1">{s.name}</p>
                      <CredibilityMeter value={s.credibility} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/55">
                      <Badge variant="neutral" withIcon={false}>
                        {s.kind}
                      </Badge>
                      <span className="font-mono text-[11px]">id {s.id}</span>
                    </div>
                    <div className="mt-2">
                      {isMuted ? (
                        <Badge variant="muted" withIcon={false}>
                          muted
                        </Badge>
                      ) : (
                        <Badge variant="verified" withIcon={false}>
                          active
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      <p className="text-xs text-white/55">
        Want to mute or unmute sources?{' '}
        <Link href="/settings" className="underline hover:text-white">
          Open settings
        </Link>
      </p>
    </div>
  );
}

function CredibilityMeter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const tone = pct >= 80 ? 'bg-brand-500' : pct >= 65 ? 'bg-warn-500' : 'bg-white/40';
  return (
    <div className="flex items-center gap-2" aria-label={`Credibility ${pct} of 100`}>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
        <div className={`h-1 ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-white/65 tabular-nums">{pct}</span>
    </div>
  );
}
