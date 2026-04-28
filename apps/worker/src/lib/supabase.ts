import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  client = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

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
  return data.id as string;
}

export async function finishEngineRun(
  id: string | null,
  patch: {
    status: 'success' | 'partial' | 'failed';
    records_in?: number;
    records_out?: number;
    errors?: string[];
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  if (!id) return;
  const { error } = await supabase()
    .from('engine_runs')
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('[engine_run] finish failed:', error.message);
}
