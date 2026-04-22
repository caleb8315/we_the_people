import type { SupabaseClient } from '@supabase/supabase-js';

export type ProductEventName =
  | 'feed_viewed'
  | 'feed_mode_switched'
  | 'briefing_generated'
  | 'briefing_opened'
  | 'alert_sent'
  | 'alert_muted'
  | 'preferences_updated'
  | 'feed_view_toggled'
  | 'map_opened'
  | 'map_filter_changed'
  | 'signal_opened_from_map'
  | 'mobile_nav_used'
  | 'feed_scrolled_depth'
  | 'saved_view_applied'
  // Phase 5 — verify-flow telemetry for KPI tracking (helpful % / D7 uplift).
  | 'verify_submitted'
  | 'verify_result_viewed'
  | 'verify_shared'
  | 'signal_feedback_sent'
  // Phase 9 — live story-development enrichment (same pipeline as /verify).
  | 'signal_developed';

export async function logProductEvent(
  sb: SupabaseClient,
  input: {
    userId: string;
    eventName: ProductEventName;
    eventProps?: Record<string, unknown>;
  },
) {
  await sb.from('product_events').insert({
    user_id: input.userId,
    event_name: input.eventName,
    event_props: input.eventProps ?? {},
  });
}
