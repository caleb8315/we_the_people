import type { SupabaseClient } from '@supabase/supabase-js';
import {
  contradictionsToRows,
  type DetectedContradiction,
} from '@osint/core/contradictions';

/**
 * Idempotent, per-signal contradiction write.
 *
 * Contract:
 *   - Called inline from the ingest loop, after the parent signal and its
 *     evidence rows have been upserted, so the write is atomic with the
 *     signal itself (same per-signal try/catch; same errors bucket).
 *   - Replace semantics: every call deletes all prior `contradictions`
 *     rows for `signalId` and inserts the freshly detected set. This
 *     guarantees no row duplication across ingest runs, even when a signal
 *     is re-processed hourly.
 *   - Scoped per signal: the delete is narrowed to `signal_id`, never a
 *     global truncate.
 */
export async function upsertContradictions(
  sb: SupabaseClient,
  signalId: string,
  contradictions: DetectedContradiction[],
): Promise<{ inserted: number; error: string | null }> {
  const { error: delErr } = await sb
    .from('contradictions')
    .delete()
    .eq('signal_id', signalId);
  if (delErr) return { inserted: 0, error: `delete: ${delErr.message}` };

  if (contradictions.length === 0) {
    return { inserted: 0, error: null };
  }

  const rows = contradictionsToRows(signalId, contradictions);
  const { error: insErr } = await sb.from('contradictions').insert(rows);
  if (insErr) return { inserted: 0, error: `insert: ${insErr.message}` };

  return { inserted: rows.length, error: null };
}
