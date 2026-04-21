/**
 * Topic affinity groups — shared between clustering and signal matching.
 *
 * Topics in the same group can cluster together. This catches events that
 * straddle categories (e.g. a war-triggered refugee crisis → war + civil,
 * an earthquake causing civil unrest → disaster + civil).
 */

export const TOPIC_AFFINITY: Record<string, string> = {
  war: 'conflict',
  civil: 'conflict',
  disaster: 'hazard',
  climate: 'hazard',
  economy: 'economy',
  health: 'health',
  cyber: 'cyber',
  other: 'other',
};

export function topicGroup(topic: string): string {
  return TOPIC_AFFINITY[topic] ?? topic;
}
