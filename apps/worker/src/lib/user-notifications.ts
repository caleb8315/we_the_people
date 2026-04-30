import type { SupabaseClient } from '@supabase/supabase-js';

type NotificationType = 'daily_briefing' | 'priority_alert' | 'summary';

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  summary: string;
  body: string;
  signalId?: string | null;
  briefingId?: string | null;
  data?: Record<string, unknown>;
}

export async function createUserNotification(
  sb: SupabaseClient,
  input: CreateNotificationInput,
): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const row = {
    user_id: input.userId,
    type: input.type,
    title: input.title.slice(0, 200),
    summary: input.summary.slice(0, 600),
    body: input.body.slice(0, 12000),
    signal_id: input.signalId ?? null,
    briefing_id: input.briefingId ?? null,
    data: input.data ?? {},
  };

  const { error } = await sb.from('user_notifications').insert(row);
  if (!error) return { ok: true };

  const msg = String(error.message ?? '').toLowerCase();
  if (msg.includes('duplicate key') || msg.includes('unique')) {
    return { ok: true, duplicate: true };
  }
  return { ok: false, error: error.message };
}
