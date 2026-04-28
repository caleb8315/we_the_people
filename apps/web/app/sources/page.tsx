import type { Metadata } from 'next';
import { getServerSupabase } from '@/lib/supabase-server';
import {
  groupLabel,
  groupSourceRow,
  hasGeoCoverage,
  type SourceCatalogRow,
  SOURCE_GROUP_ORDER,
} from '@osint/core/source-catalog';
import { StatTile } from '@/components/ui/stat-tile';

export const metadata: Metadata = {
  title: 'Sources · Crosscheck',
  description:
    'Live catalog of the public feeds, official datasets, and monitored source groups that power Crosscheck.',
};

export const dynamic = 'force-dynamic';

export default async function PublicSourcesPage() {
  let rows: SourceCatalogRow[] = [];

  try {
    const sb = getServerSupabase();
    const { data } = await sb
      .from('sources')
      .select('id, name, kind, country_code, credibility, metadata, enabled')
      .eq('enabled', true)
      .order('credibility', { ascending: false });
    rows = (data ?? []) as SourceCatalogRow[];
  } catch {
    rows = [];
  }

  const groups = new Map<string, SourceCatalogRow[]>();
  for (const row of rows) {
    const key = groupSourceRow(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const highCredibility = rows.filter((row) => row.credibility >= 80).length;
  const geoReady = rows.filter((row) => hasGeoCoverage(row)).length;

  return (
    <div className="space-y-6">
      <header className="max-w-3xl space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
          Public source catalog
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Where Crosscheck gets coverage</h1>
        <p className="text-sm text-ink-500">
          This is the live list of enabled source families and feeds currently monitored by the platform.
          It complements the methodology and licensing pages by showing the actual coverage surface users
          can expect today.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Enabled sources" value={rows.length} tone="accent" />
        <StatTile label="Source groups" value={groups.size} />
        <StatTile label="High credibility" value={highCredibility} hint="credibility 80+" />
        <StatTile label="Geo-capable" value={geoReady} hint="map/sensor oriented coverage" />
      </section>

      {rows.length === 0 ? (
        <section className="rounded-card border border-ink-100 bg-paper p-5 text-sm text-ink-500 shadow-card">
          Source metadata is temporarily unavailable. The monitored source set is still documented in the
          methodology and licensing pages while the catalog reconnects.
        </section>
      ) : (
        SOURCE_GROUP_ORDER.filter((group) => groups.has(group)).map((group) => (
          <section key={group} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-600">
                {groupLabel(group)}
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                {groups.get(group)!.length} enabled {groups.get(group)!.length === 1 ? 'source' : 'sources'}
              </p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {groups.get(group)!.map((row) => (
                <li key={row.id} className="rounded-card border border-ink-100 bg-paper p-3 shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-ink">{row.name}</p>
                    <span className="text-[11px] tabular-nums text-ink-500">{row.credibility}/100</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-ink-500">
                    <span className="rounded-full bg-canvas-50 px-2 py-1">{row.kind}</span>
                    <span className="rounded-full bg-canvas-50 px-2 py-1">id {row.id}</span>
                    {row.country_code && (
                      <span className="rounded-full bg-canvas-50 px-2 py-1">{row.country_code}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
