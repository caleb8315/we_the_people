import type { SupabaseClient } from '@supabase/supabase-js';

type ProductEventName =
  | 'feed_viewed'
  | 'feed_mode_switched'
  | 'briefing_generated'
  | 'briefing_opened'
  | 'alert_sent'
  | 'alert_muted'
  | 'preferences_updated';

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
