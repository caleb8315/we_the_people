import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase-server';
import { DEFAULT_AI_SYSTEM_PROMPT } from '@/lib/ai-defaults';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  display_name: z.string().min(2).max(40),
  topics: z.array(z.enum(['war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster', 'tech', 'finance', 'other'])).min(1).max(8),
  feed_mode_preference: z.enum(['personalized', 'global', 'hybrid']).optional(),
  briefing_frequency_preference: z.enum(['daily', 'weekly', 'both', 'off']).optional(),
  alert_intensity_preference: z.enum(['critical_only', 'important_and_up', 'all']).optional(),
  max_alerts_per_day_preference: z.number().int().min(1).max(5).optional(),
});

/**
 * POST /api/onboarding/complete
 * Finalizes first-time setup and unlocks dashboard.
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'onboarding-complete'), 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const now = new Date().toISOString();
  const {
    display_name,
    topics,
    feed_mode_preference,
    briefing_frequency_preference,
    alert_intensity_preference,
    max_alerts_per_day_preference,
  } = parsed.data;

  const [{ error: profileErr }, { error: prefsErr }, { error: aiErr }] = await Promise.all([
    sb.from('profiles').upsert(
      {
        user_id: auth.user.id,
        display_name,
        onboarded_at: now,
      },
      { onConflict: 'user_id' },
    ),
    sb.from('preferences').upsert(
      {
        user_id: auth.user.id,
        topics,
        feed_mode_preference: feed_mode_preference ?? 'personalized',
        briefing_frequency_preference: briefing_frequency_preference ?? 'daily',
        notifications_enabled: true,
        alert_intensity_preference: alert_intensity_preference ?? 'critical_only',
        max_alerts_per_day_preference: max_alerts_per_day_preference ?? 3,
        min_alert_severity: 85,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    ),
    sb.from('ai_profiles').upsert(
      {
        user_id: auth.user.id,
        system_prompt: DEFAULT_AI_SYSTEM_PROMPT,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    ),
  ]);

  const error = profileErr ?? prefsErr ?? aiErr;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
