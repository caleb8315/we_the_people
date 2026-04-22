import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { logProductEvent, type ProductEventName } from '@/lib/product-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EventBody = z.object({
  event_name: z.enum([
    'feed_viewed',
    'feed_mode_switched',
    'briefing_generated',
    'briefing_opened',
    'alert_sent',
    'alert_muted',
    'preferences_updated',
    'feed_view_toggled',
    'map_opened',
    'map_filter_changed',
    'signal_opened_from_map',
    'mobile_nav_used',
    'feed_scrolled_depth',
    'saved_view_applied',
    'verify_submitted',
    'verify_result_viewed',
    'verify_shared',
    'signal_feedback_sent',
  ]),
  event_props: z.record(z.unknown()).optional(),
});

/**
 * POST /api/events
 * Client-side telemetry endpoint. Uses the logged-in session and RLS.
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'events-post'), 120, 60_000);
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
  const parsed = EventBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.flatten() }, { status: 400 });
  }

  await logProductEvent(sb, {
    userId: auth.user.id,
    eventName: parsed.data.event_name as ProductEventName,
    eventProps: parsed.data.event_props ?? {},
  });
  return NextResponse.json({ ok: true });
}
