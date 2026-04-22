/**
 * Topic affinity groups — shared between clustering and signal matching.
 *
 * Topics in the same group can cluster together. This catches events that
 * straddle categories (e.g. a war-triggered refugee crisis → war + civil,
 * an earthquake causing civil unrest → disaster + civil).
 *
 * IMPORTANT: 'other' means "unclassified" — it could be any topic.
 * The topicGroupsForClustering function returns ALL groups for 'other'
 * so unclassified articles get a chance to match classified ones.
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

const ALL_GROUPS = [...new Set(Object.values(TOPIC_AFFINITY))];

export function topicGroup(topic: string): string {
  return TOPIC_AFFINITY[topic] ?? topic;
}

/**
 * For clustering, 'other' articles should be compared against ALL groups
 * since 'other' just means the classifier couldn't categorize it.
 * Returns the list of groups an article should be bucketed into.
 */
export function topicGroupsForClustering(topic: string): string[] {
  if (topic === 'other') return ALL_GROUPS;
  return [TOPIC_AFFINITY[topic] ?? topic];
}
