import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import { sendOperatorAlert } from './operator-alert';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  client = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// Remembers which job each run id belongs to so failure alerts can be
// labeled without threading the job name through every finishEngineRun call.
// Each cron invocation is a short-lived process running a single job, so this
// map never grows unbounded.
const runJobs = new Map<string, string>();

export async function startEngineRun(
  job: 'ingest' | 'brief' | 'alert' | 'develop' | 'maintenance',
): Promise<string | null> {
  const { data, error } = await supabase()
    .from('engine_runs')
    .insert({ job, status: 'running' })
    .select('id')
    .single();
  if (error) {
    console.error('[engine_run] insert failed:', error.message);
    return null;
  }
  const id = data.id as string;
  runJobs.set(id, job);
  return id;
}

export async function finishEngineRun(
  id: string | null,
  patch: {
    status: 'success' | 'partial' | 'failed';
    records_in?: number;
    records_out?: number;
    errors?: string[];
    meta?: Record<string, unknown>;
    /** Job name for operator alerts; falls back to a lookup when omitted. */
    job?: string;
  },
): Promise<void> {
  const { job, ...update } = patch;
  if (id) {
    const { error } = await supabase()
      .from('engine_runs')
      .update({ ...update, finished_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.error('[engine_run] finish failed:', error.message);
  }

  const resolvedJob = job ?? (id ? runJobs.get(id) : undefined) ?? 'job';
  if (id) runJobs.delete(id);

  // Automatic operator alert: a fully failed job is a "the pipeline is down"
  // event and always pages. Partial failures only page when they actually
  // carried errors (a partial run with zero errors is normal steady state).
  const shouldAlert =
    patch.status === 'failed' ||
    (patch.status === 'partial' && (patch.errors?.length ?? 0) > 0);
  if (shouldAlert) {
    const jobName = resolvedJob;
    const errorsText =
      (patch.errors ?? []).slice(0, 10).map((e) => `• ${e}`).join('\n') || '(no error detail)';
    await sendOperatorAlert(
      {
        subject: `${jobName} run ${patch.status}`,
        severity: patch.status === 'failed' ? 'error' : 'warn',
        dedupeKey: `engine_run:${jobName}:${patch.status}`,
        body: [
          `Background job "${jobName}" finished with status: ${patch.status}.`,
          `records_in=${patch.records_in ?? 0} records_out=${patch.records_out ?? 0}`,
          '',
          'Errors:',
          errorsText,
        ].join('\n'),
      },
      supabase(),
    );
  }
}
