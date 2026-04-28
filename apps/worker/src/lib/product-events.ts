import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductEventName } from '@osint/core/product-events';

export type { ProductEventName } from '@osint/core/product-events';

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
