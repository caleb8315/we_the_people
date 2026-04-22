import type { Adapter, RawItem } from './base';

/**
 * Mastodon public-timeline adapter.
 *
 * Mastodon has no single "firehose" — it's a federated network. Instead
 * we poll the public timelines of a small set of community-operated
 * instances (journalism + civic-tech heavy). Each instance exposes
 * `GET /api/v1/timelines/public?local=false&limit=40` without auth.
 *
 * Mastodon posts are social-tier evidence (same guardrail as Bluesky /
 * Reddit). Their hosts are intentionally NOT in the credible-source list.
 */
export class MastodonAdapter implements Adapter {
  readonly id = 'mastodon-public';
  readonly label = 'Mastodon (public timelines)';
  private readonly instances: string[];

  constructor(
    instances: string[] = ['mastodon.social', 'journa.host', 'mstdn.social'],
  ) {
    this.instances = instances;
  }

  async fetch(): Promise<RawItem[]> {
    const all: RawItem[] = [];
    for (const host of this.instances) {
      try {
        const res = await fetch(
          `https://${host}/api/v1/timelines/public?local=false&limit=40`,
          {
            headers: {
              'user-agent': 'Crosscheck-Bot/1.0 (+https://crosscheck.local)',
              accept: 'application/json',
            },
          },
        );
        if (!res.ok) continue;
        const json = (await res.json()) as MastodonStatus[];
        for (const status of json ?? []) {
          const text = stripTags(status.content ?? '').trim();
          if (!text) continue;
          all.push({
            source_id: this.id,
            title: text.slice(0, 240),
            summary: text.length > 240 ? text.slice(0, 1000) : null,
            url: status.url ?? status.uri,
            published_at: status.created_at ?? null,
            raw: {
              platform: 'mastodon',
              instance: host,
              account_acct: status.account?.acct,
              favourites: status.favourites_count,
              reblogs: status.reblogs_count,
              replies: status.replies_count,
            },
          });
        }
      } catch {
        // per-instance errors are non-fatal
      }
    }
    return all;
  }
}

interface MastodonStatus {
  id: string;
  uri: string;
  url?: string;
  content?: string;
  created_at?: string;
  favourites_count?: number;
  reblogs_count?: number;
  replies_count?: number;
  account?: { acct?: string };
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}
