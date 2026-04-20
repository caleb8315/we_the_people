/**
 * Core domain types shared across worker, web, and schema contracts.
 * Mirrors the Supabase schema in supabase/migrations/001_init.sql.
 */

export type Topic =
  | 'war'
  | 'economy'
  | 'climate'
  | 'health'
  | 'civil'
  | 'cyber'
  | 'disaster'
  | 'other';

export const TOPICS: Topic[] = [
  'war',
  'economy',
  'climate',
  'health',
  'civil',
  'cyber',
  'disaster',
  'other',
];

/**
 * Internal reliability enum. These values persist in the database and in RLS
 * policies, so they cannot be renamed without a migration. They are NEVER
 * rendered directly in the UI — use `statusLabel()` from `./verification`.
 *
 * Mapping to user-facing labels:
 *   verified    → "Corroborated"
 *   developing  → "Developing"
 *   unverified  → "Single-source"
 *   quarantined → "Flagged"
 *   blocked     → "Suppressed"
 */
export type VerificationStatus =
  | 'unverified'
  | 'developing'
  | 'verified'
  | 'quarantined'
  | 'blocked';

// Neutral alias for new code.
export type ReliabilityStatus = VerificationStatus;

export type ConfidenceLabel = 'low' | 'medium' | 'high';

export interface SourceRow {
  id: string;
  name: string;
  kind: 'rss' | 'api' | 'dataset' | 'official' | 'social';
  url: string | null;
  country_code: string | null;
  credibility: number;
  is_credible: boolean;
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export interface EvidenceItem {
  source_id: string | null;
  url: string;
  domain: string;
  title: string | null;
  published_at: string | null;
  is_credible: boolean;
  excerpt: string | null;
}

export interface Signal {
  id?: string;
  dedupe_key: string;
  title: string;
  summary: string | null;
  url: string | null;
  source_id: string | null;
  topic: Topic;
  country_code: string | null;
  severity: number;             // 0–100
  confidence: number;           // 0–100
  verification_status: VerificationStatus;
  source_count: number;
  credible_source_count: number;
  distinct_domains: string[];
  tags: string[];
  occurred_at: string | null;
  first_seen_at?: string;
  last_seen_at?: string;
  expires_at: string | null;
  raw_data: Record<string, unknown>;
  evidence?: EvidenceItem[];
}

export interface Contradiction {
  signal_id: string;
  // Required by the DB contract (migration 014):
  type: 'cause_conflict' | 'numeric_conflict' | 'presence_conflict';
  severity: 'low' | 'medium' | 'high';
  summary: string;
  metadata: Record<string, unknown>;
  evidence_ids: string[];
  // Legacy columns kept for backwards compatibility with older UI reads.
  // New rows populate both the new contract and these fields.
  claim?: string;
  observation?: string;
  explanation?: string | null;
  confidence?: number;
}

export interface Briefing {
  id?: string;
  kind: 'daily' | 'weekly';
  period_start: string;
  period_end: string;
  headline: string;
  body_markdown: string;
  signal_ids: string[];
  topics: string[];
}

export interface Preferences {
  user_id: string;
  topics: Topic[];
  muted_sources: string[];
  muted_topics: Topic[];
  countries_of_focus: string[];
  email_briefings: boolean;
  alerts_enabled: boolean;
  min_alert_severity: number;
  feed_mode_preference: 'personalized' | 'global' | 'hybrid';
  briefing_frequency_preference: 'daily' | 'weekly' | 'both' | 'off';
  alert_intensity_preference: 'critical_only' | 'important_and_up' | 'all';
  max_alerts_per_day_preference: number;
}
