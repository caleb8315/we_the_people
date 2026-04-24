import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { logProductEvent } from '@/lib/product-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TopicEnum = z.enum(['war', 'economy', 'climate', 'health', 'civil', 'cyber', 'disaster', 'tech', 'finance', 'other']);

const PrefBody = z.object({
  topics: z.array(TopicEnum).max(16).optional(),
  muted_sources: z.array(z.string().max(64)).max(64).optional(),
  muted_topics: z.array(TopicEnum).max(8).optional(),
  countries_of_focus: z.array(z.string().length(2)).max(32).optional(),
  email_briefings: z.boolean().optional(),
  alerts_enabled: z.boolean().optional(),
  min_alert_severity: z.number().int().min(0).max(100).optional(),
  weather_lat: z.number().min(-90).max(90).nullable().optional(),
  weather_lon: z.number().min(-180).max(180).nullable().optional(),
  weather_label: z.string().max(120).nullable().optional(),
  feed_mode_preference: z.enum(['personalized', 'global', 'hybrid']).optional(),
  briefing_frequency_preference: z.enum(['daily', 'weekly', 'both', 'off']).optional(),
  alert_intensity_preference: z.enum(['critical_only', 'important_and_up', 'all']).optional(),
  max_alerts_per_day_preference: z.number().int().min(1).max(5).optional(),
});

export async function GET(req: Request) {
  const rl = limit(getClientKey(req, 'prefs-get'), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('preferences')
    .select('*')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preferences: data ?? null });
}

export async function PUT(req: Request) {
  const rl = limit(getClientKey(req, 'prefs-put'), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = PrefBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.flatten() }, { status: 400 });
  }

  const normalized = { ...parsed.data };
  if (normalized.briefing_frequency_preference === 'off') {
    normalized.email_briefings = false;
  }
  const row = { user_id: auth.user.id, updated_at: new Date().toISOString(), ...normalized };
  const { error } = await sb.from('preferences').upsert(row, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logProductEvent(sb, {
    userId: auth.user.id,
    eventName: 'preferences_updated',
    eventProps: {
      keys: Object.keys(parsed.data).sort(),
      alert_intensity_preference: parsed.data.alert_intensity_preference ?? null,
      max_alerts_per_day_preference: parsed.data.max_alerts_per_day_preference ?? null,
      briefing_frequency_preference: parsed.data.briefing_frequency_preference ?? null,
      feed_mode_preference: parsed.data.feed_mode_preference ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
