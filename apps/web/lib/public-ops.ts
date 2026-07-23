import { sourceGroupKey, SOURCE_GROUP_LABELS, type SourceCatalogRow } from '@osint/core/source-catalog';
import { getServerSupabase } from '@/lib/supabase-server';

type JobName = 'ingest' | 'brief' | 'alert' | 'develop';

interface EngineRunRow {
  job: JobName;
  status: 'running' | 'success' | 'partial' | 'failed';
  started_at: string;
  records_out?: number | null;
}

interface SourceHealthRow {
  source_id: string;
  run_at: string;
  status: 'ok' | 'degraded' | 'failed';
  latency_ms?: number | null;
  items_fetched?: number | null;
  error?: string | null;
}

export interface PublicJobSnapshot {
  lastSuccessAt: string | null;
  lastStatus: string | null;
}

export interface PublicJobCard {
  job: JobName;
  health: 'healthy' | 'degraded' | 'unknown';
  lastRunLabel: string;
  successRate: number;
  recordsOut: number;
  runCount: number;
}

export interface PublicSourceGroup {
  label: string;
  total: number;
  ok: number;
  degraded: number;
  latestRunLabel: string;
}

export interface PublicOperationsSnapshot {
  generatedAt: string;
  jobs: Record<JobName | 'web', PublicJobSnapshot>;
  totals: {
    signals: number;
    sources: number;
  };
  jobSummary: {
    totalRuns30d: number;
    successRate30d: number;
  };
  sourceHealth: {
    total: number;
    degraded: number;
    failed: number;
  };
  jobCards: PublicJobCard[];
  sourceGroups: PublicSourceGroup[];
}

export async function getPublicOperationsSnapshot(): Promise<PublicOperationsSnapshot> {
  const sb = getServerSupabase();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const [
    { data: runs7d },
    { data: runs30d },
    { data: sourceHealthRows },
    { data: sources },
    { count: signalCount },
    { count: sourceCount },
  ] = await Promise.all([
    sb
      .from('engine_runs_public')
      .select('job,status,started_at,records_out')
      .gte('started_at', since7d)
      .in('job', ['ingest', 'brief', 'alert', 'develop'])
      .order('started_at', { ascending: false })
      .limit(200),
    sb
      .from('engine_runs_public')
      .select('job,status,started_at')
      .gte('started_at', since30d)
      .in('job', ['ingest', 'brief', 'alert', 'develop'])
      .order('started_at', { ascending: false })
      .limit(500),
    sb
      .from('source_health_current')
      .select('source_id,run_at,status,latency_ms,items_fetched,error')
      .order('run_at', { ascending: false })
      .limit(50),
    sb.from('sources').select('id, kind, metadata, country_code, name, credibility, enabled'),
    sb.from('signals_public').select('id', { count: 'exact', head: true }),
    sb.from('sources').select('id', { count: 'exact', head: true }).eq('enabled', true),
  ]);

  const recentRuns = (runs7d ?? []) as EngineRunRow[];
  const monthRuns = (runs30d ?? []) as EngineRunRow[];
  const healthRows = (sourceHealthRows ?? []) as SourceHealthRow[];
  const sourceRows = ((sources ?? []).filter((row) => row.enabled) as SourceCatalogRow[]);

  const jobs: Record<JobName | 'web', PublicJobSnapshot> = {
    web: {
      lastSuccessAt: recentRuns.find((row) => row.job === 'ingest' && row.status === 'success')?.started_at ?? null,
      lastStatus: recentRuns[0]?.status ?? null,
    },
    ingest: snapshotForJob(recentRuns, 'ingest'),
    brief: snapshotForJob(recentRuns, 'brief'),
    alert: snapshotForJob(recentRuns, 'alert'),
    develop: snapshotForJob(recentRuns, 'develop'),
  };

  const healthyOrPartial30d = monthRuns.filter((row) => row.status === 'success' || row.status === 'partial').length;
  const jobCards = (['ingest', 'brief', 'alert', 'develop'] as const).map((job) =>
    buildJobCard(job, recentRuns.filter((row) => row.job === job)),
  );

  const groupedSourceHealth = new Map<string, { total: number; ok: number; degraded: number; latestRunAt: string | null }>();
  for (const source of sourceRows) {
    const group = sourceGroupKey(source);
    if (!groupedSourceHealth.has(group)) {
      groupedSourceHealth.set(group, { total: 0, ok: 0, degraded: 0, latestRunAt: null });
    }
    groupedSourceHealth.get(group)!.total += 1;
  }

  const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
  for (const row of healthRows) {
    const source = sourceById.get(row.source_id);
    if (!source) continue;
    const group = sourceGroupKey(source);
    const stats = groupedSourceHealth.get(group);
    if (!stats) continue;
    if (row.status === 'ok') stats.ok += 1;
    else stats.degraded += 1;
    if (!stats.latestRunAt || row.run_at > stats.latestRunAt) stats.latestRunAt = row.run_at;
  }

  const sourceGroups = [...groupedSourceHealth.entries()]
    .map(([group, stats]) => ({
      label: SOURCE_GROUP_LABELS[group as keyof typeof SOURCE_GROUP_LABELS] ?? group,
      total: stats.total,
      ok: stats.ok,
      degraded: stats.degraded,
      latestRunLabel: formatTimestamp(stats.latestRunAt),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const failedSources = healthRows.filter((row) => row.status === 'failed').length;
  const degradedSources = healthRows.filter((row) => row.status === 'degraded').length;

  return {
    generatedAt: new Date().toISOString(),
    jobs,
    totals: {
      signals: signalCount ?? 0,
      sources: sourceCount ?? 0,
    },
    jobSummary: {
      totalRuns30d: monthRuns.length,
      successRate30d: monthRuns.length === 0 ? 0 : Math.round((100 * healthyOrPartial30d) / monthRuns.length),
    },
    sourceHealth: {
      total: healthRows.length,
      degraded: degradedSources,
      failed: failedSources,
    },
    jobCards,
    sourceGroups,
  };
}

export async function getPublicOpsSnapshot() {
  const snapshot = await getPublicOperationsSnapshot();
  return {
    totalRuns: snapshot.jobCards.reduce((sum, job) => sum + job.runCount, 0),
    successRate: snapshot.jobCards.length === 0
      ? 0
      : Math.round(
          snapshot.jobCards.reduce((sum, job) => sum + job.successRate, 0) / snapshot.jobCards.length,
        ),
    totalSources: snapshot.totals.sources,
    degradedSources: snapshot.sourceHealth.degraded + snapshot.sourceHealth.failed,
    jobCards: snapshot.jobCards,
    sourceGroups: snapshot.sourceGroups,
  };
}

function snapshotForJob(rows: EngineRunRow[], job: JobName): PublicJobSnapshot {
  const jobRows = rows.filter((row) => row.job === job);
  return {
    lastSuccessAt: jobRows.find((row) => row.status === 'success' || row.status === 'partial')?.started_at ?? null,
    lastStatus: jobRows[0]?.status ?? null,
  };
}

function buildJobCard(job: JobName, rows: EngineRunRow[]): PublicJobCard {
  const healthyRuns = rows.filter((row) => row.status === 'success' || row.status === 'partial').length;
  const successRate = rows.length === 0 ? 0 : Math.round((100 * healthyRuns) / rows.length);
  const latest = rows[0];
  const recordsOut = rows.reduce((sum, row) => sum + Number(row.records_out ?? 0), 0);

  return {
    job,
    health: !latest ? 'unknown' : latest.status === 'failed' ? 'degraded' : 'healthy',
    lastRunLabel: formatTimestamp(latest?.started_at ?? null),
    successRate,
    recordsOut,
    runCount: rows.length,
  };
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not available yet';
  return new Date(value).toLocaleString();
}
