import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';

const DEFAULT_USAGE_RETENTION_DAYS = 60;
const DEFAULT_SIGNAL_GRACE_DAYS = 1;

export interface MaintenanceOptions {
  usageRetentionDays?: number;
  expiredSignalGraceDays?: number;
  dryRun?: boolean;
}

interface CountResult {
  count: number;
  error: string | null;
}

export async function runMaintenance(opts: MaintenanceOptions = {}): Promise<{
  usageLedgerPruned: number;
  expiredSignalsPruned: number;
  errors: number;
}> {
  const usageRetentionDays = opts.usageRetentionDays ?? DEFAULT_USAGE_RETENTION_DAYS;
  const expiredSignalGraceDays = opts.expiredSignalGraceDays ?? DEFAULT_SIGNAL_GRACE_DAYS;
  const dryRun = Boolean(opts.dryRun);

  const runId = await startEngineRun('maintenance');
  const errors: string[] = [];
  const sb = supabase();

  const usageBefore = await countUsageLedgerRowsOlderThan(sb, usageRetentionDays);
  if (usageBefore.error) errors.push(usageBefore.error);

  const expiredSignalsBefore = await countExpiredSignals(sb, expiredSignalGraceDays);
  if (expiredSignalsBefore.error) errors.push(expiredSignalsBefore.error);

  let usageLedgerPruned = 0;
  let expiredSignalsPruned = 0;

  if (!dryRun) {
    const usageDelete = await deleteUsageLedgerRowsOlderThan(sb, usageRetentionDays);
    usageLedgerPruned = usageDelete.count;
    if (usageDelete.error) errors.push(usageDelete.error);

    const signalDelete = await deleteExpiredSignals(sb, expiredSignalGraceDays);
    expiredSignalsPruned = signalDelete.count;
    if (signalDelete.error) errors.push(signalDelete.error);
  }

  const recordsIn = (usageBefore.count ?? 0) + (expiredSignalsBefore.count ?? 0);
  const recordsOut = dryRun ? 0 : usageLedgerPruned + expiredSignalsPruned;

  await finishEngineRun(runId, {
    status: errors.length === 0 ? 'success' : dryRun ? 'partial' : 'failed',
    records_in: recordsIn,
    records_out: recordsOut,
    errors,
    meta: {
      dry_run: dryRun,
      usage_retention_days: usageRetentionDays,
      expired_signal_grace_days: expiredSignalGraceDays,
      usage_candidates: usageBefore.count,
      expired_signal_candidates: expiredSignalsBefore.count,
      usage_pruned: usageLedgerPruned,
      expired_signals_pruned: expiredSignalsPruned,
    },
  });

  if (dryRun) {
    console.log(
      `[maintenance] dry run — usage candidates=${usageBefore.count}, expired signal candidates=${expiredSignalsBefore.count}`,
    );
  } else {
    console.log(
      `[maintenance] pruned usage_ledger=${usageLedgerPruned}, expired signals=${expiredSignalsPruned}`,
    );
  }

  return {
    usageLedgerPruned,
    expiredSignalsPruned,
    errors: errors.length,
  };
}

async function countUsageLedgerRowsOlderThan(
  sb: ReturnType<typeof supabase>,
  retentionDays: number,
): Promise<CountResult> {
  const cutoff = cutoffDate(retentionDays);
  const { count, error } = await sb
    .from('usage_ledger')
    .select('id', { count: 'exact', head: true })
    .lt('day', cutoff);

  return { count: count ?? 0, error: error ? `usage_ledger count: ${error.message}` : null };
}

async function deleteUsageLedgerRowsOlderThan(
  sb: ReturnType<typeof supabase>,
  retentionDays: number,
): Promise<CountResult> {
  const cutoff = cutoffDate(retentionDays);
  const { data, error } = await sb.from('usage_ledger').delete().lt('day', cutoff).select('id');
  return { count: data?.length ?? 0, error: error ? `usage_ledger delete: ${error.message}` : null };
}

async function countExpiredSignals(
  sb: ReturnType<typeof supabase>,
  graceDays: number,
): Promise<CountResult> {
  const cutoff = cutoffTimestamp(graceDays);
  const { count, error } = await sb
    .from('signals')
    .select('id', { count: 'exact', head: true })
    .not('expires_at', 'is', null)
    .lt('expires_at', cutoff);

  return { count: count ?? 0, error: error ? `signals count: ${error.message}` : null };
}

async function deleteExpiredSignals(
  sb: ReturnType<typeof supabase>,
  graceDays: number,
): Promise<CountResult> {
  const cutoff = cutoffTimestamp(graceDays);
  const { data, error } = await sb
    .from('signals')
    .delete()
    .not('expires_at', 'is', null)
    .lt('expires_at', cutoff)
    .select('id');

  return { count: data?.length ?? 0, error: error ? `signals delete: ${error.message}` : null };
}

function cutoffDate(retentionDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - retentionDays);
  return date.toISOString().slice(0, 10);
}

function cutoffTimestamp(graceDays: number): string {
  return new Date(Date.now() - graceDays * 24 * 3600_000).toISOString();
}
