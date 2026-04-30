import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { Badge } from '@/components/ui/badge';
import { StatTile } from '@/components/ui/stat-tile';
import {
  groupSourceCatalog,
  hasGeoCoverage,
  SOURCE_GROUP_LABELS,
  SOURCE_GROUP_ORDER,
  type SourceCatalogRow,
} from '@osint/core/source-catalog';

export const metadata = { title: 'Sources · Crosscheck' };
export const dynamic = 'force-dynamic';

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
      .select('id, name, kind, country_code, credibility, metadata, enabled')
      .eq('enabled', true)
      .order('credibility', { ascending: false }),
    sb.from('preferences').select('muted_sources').eq('user_id', auth.user.id).maybeSingle(),
  ]);

  const muted = new Set((prefs?.muted_sources ?? []) as string[]);
  const rows = (sources ?? []) as SourceCatalogRow[];
  const groups = groupSourceCatalog(rows);

  const mutedCount = rows.filter((s) => muted.has(s.id)).length;
  const activeCount = rows.length - mutedCount;
  const highCredCount = rows.filter((s) => s.credibility >= 80).length;
  const mapReadyCount = rows.filter((s) => hasGeoCoverage(s)).length;

  return (
    <div className="space-y-5 sm:space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Source control</h1>
        <p className="mt-1 text-sm text-ink-500">
          Grouped by type, sorted by credibility. Your muted sources are flagged and excluded from your personal view.
        </p>
      </header>

      <section className="grid gap-2.5 sm:gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Sources active" value={activeCount} hint={`in your account (of ${rows.length})`} tone="accent" />
        <StatTile label="You have muted" value={mutedCount} tone={mutedCount > 0 ? 'warn' : 'neutral'} />
        <StatTile label="High credibility" value={highCredCount} hint="credibility 80+" />
        <StatTile label="Map-ready sources" value={mapReadyCount} hint="geo-capable coverage" />
      </section>

      {SOURCE_GROUP_ORDER
        .filter((k) => groups.has(k))
        .map((k) => (
          <section key={k}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-600">
              {SOURCE_GROUP_LABELS[k] ?? k}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {groups.get(k)!.map((s) => {
                const isMuted = muted.has(s.id);
                return (
                  <li
                    key={s.id}
                    className={`rounded-card border p-3 text-sm ${
                      isMuted ? 'border-danger-200 bg-danger-50' : 'border-ink-100 bg-paper'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium clamp-1">{s.name}</p>
                      <CredibilityMeter value={s.credibility} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
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

      <p className="text-xs text-ink-500">
        Want to mute or unmute sources?{' '}
        <Link href="/settings" className="underline hover:text-ink">
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
      <div className="h-1 w-16 overflow-hidden rounded-full bg-ink-100">
        <div className={`h-1 ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-ink-600 tabular-nums">{pct}</span>
    </div>
  );
}
