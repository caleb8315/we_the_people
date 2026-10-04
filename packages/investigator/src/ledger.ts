import { extractDomain, outletProfile } from '@osint/core';
import type { ReportSource } from './schema';

export interface LedgerEntry extends ReportSource {
  snippet: string | null;
  /** Full article text when read; the citation verifier checks quotes against this. */
  text: string | null;
}

export interface AddSourceInput {
  url: string;
  /** Publisher domain when the URL is a redirect/aggregator link. */
  domain?: string | null;
  title?: string | null;
  outlet?: string | null;
  snippet?: string | null;
  text?: string | null;
  published_at?: string | null;
  language?: string | null;
  country?: string | null;
  retrieved_via: string;
}

function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ocid|cmpid|ref$|src$)/i.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

/**
 * Every piece of evidence any tool touches is registered here with a short
 * stable id ("S1", "S2", …). The model cites these ids, and the citation
 * verifier checks quotes against the stored text — so a citation can never
 * point at something the investigation did not actually retrieve.
 */
export class SourceLedger {
  private entries: LedgerEntry[] = [];
  private byUrl = new Map<string, LedgerEntry>();
  private listeners: Array<(e: LedgerEntry, isNew: boolean) => void> = [];

  onChange(fn: (e: LedgerEntry, isNew: boolean) => void): void {
    this.listeners.push(fn);
  }

  add(input: AddSourceInput): LedgerEntry {
    const key = canonicalUrl(input.url);
    const existing = this.byUrl.get(key);
    if (existing) {
      let changed = false;
      if (!existing.title && input.title) (existing.title = input.title), (changed = true);
      if (!existing.snippet && input.snippet) (existing.snippet = input.snippet), (changed = true);
      if (input.text && (!existing.text || input.text.length > existing.text.length)) {
        existing.text = input.text;
        existing.read_full_text = true;
        changed = true;
      }
      if (!existing.published_at && input.published_at) existing.published_at = input.published_at;
      if (!existing.language && input.language) existing.language = input.language;
      if (changed) this.listeners.forEach((fn) => fn(existing, false));
      return existing;
    }

    const domain = (input.domain?.toLowerCase().replace(/^www\./, '') || extractDomain(input.url)) || 'unknown';
    const profile = outletProfile(domain);
    const wikiLang = domain.match(/^([a-z-]+)\.(?:m\.)?wikipedia\.org$/)?.[1];
    const entry: LedgerEntry = {
      id: `S${this.entries.length + 1}`,
      url: input.url,
      title: input.title ?? null,
      outlet: wikiLang ? `Wikipedia (${wikiLang})` : input.outlet?.trim() || profile?.name || domain,
      domain,
      country: input.country ?? profile?.country ?? null,
      language: input.language ?? null,
      ownership: profile?.ownership ?? 'unknown',
      ownership_note: profile?.note ?? null,
      published_at: input.published_at ?? null,
      retrieved_via: input.retrieved_via,
      read_full_text: Boolean(input.text),
      snippet: input.snippet ?? null,
      text: input.text ?? null,
    };
    this.entries.push(entry);
    this.byUrl.set(key, entry);
    this.listeners.forEach((fn) => fn(entry, true));
    return entry;
  }

  get(id: string): LedgerEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  findByUrl(url: string): LedgerEntry | undefined {
    return this.byUrl.get(canonicalUrl(url));
  }

  all(): LedgerEntry[] {
    return [...this.entries];
  }

  get size(): number {
    return this.entries.length;
  }

  toPublic(e: LedgerEntry): ReportSource {
    const { snippet: _s, text: _t, ...pub } = e;
    return pub;
  }
}
