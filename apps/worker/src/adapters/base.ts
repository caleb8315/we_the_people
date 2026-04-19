import type { EvidenceItem, Signal, Topic } from '@osint/core/types';

export interface Adapter {
  id: string;                      // source_id in DB
  label: string;
  fetch(): Promise<RawItem[]>;
}

export interface RawItem {
  source_id: string;
  title: string;
  summary?: string | null;
  url: string;
  published_at?: string | null;
  country_code?: string | null;
  topic?: Topic;
  severity?: number;
  raw?: Record<string, unknown>;
}

export function rawToEvidence(r: RawItem, domain: string, isCredible: boolean): EvidenceItem {
  return {
    source_id: r.source_id,
    url: r.url,
    domain,
    title: r.title,
    published_at: r.published_at ?? null,
    is_credible: isCredible,
    excerpt: r.summary ?? null,
  };
}
