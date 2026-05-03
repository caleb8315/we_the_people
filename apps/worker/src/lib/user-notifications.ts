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
  const normalizedTitle = compactSingleLine(input.title).slice(0, 200);
  const normalizedSummary = compactSingleLine(input.summary).slice(0, 600);
  const normalizedBody = compactNotificationBody(input.body, {
    title: normalizedTitle,
    summary: normalizedSummary,
  }).slice(0, 12000);

  const row = {
    user_id: input.userId,
    type: input.type,
    title: normalizedTitle,
    summary: normalizedSummary,
    body: normalizedBody,
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

function compactSingleLine(text: string): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactNotificationBody(
  raw: string,
  context: { title: string; summary: string },
): string {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return '';

  const blocked = new Set([
    normalizeLine(context.title),
    normalizeLine(context.summary),
  ]);
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const line of lines) {
    const normalized = normalizeLine(line);
    if (!normalized) continue;
    if (blocked.has(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    kept.push(line);
  }

  return kept.join('\n');
}

function normalizeLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
