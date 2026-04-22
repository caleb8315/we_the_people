import type { Adapter, RawItem } from './base';

/**
 * Bluesky public-API adapter.
 *
 * Uses the unauthenticated `public.api.bsky.app` XRPC endpoint to fetch
 * recent posts matching a broad news-relevant query. No auth required.
 *
 * Bluesky (like Reddit) is social-tier evidence. The domain `bsky.app`
 * is deliberately not credible-listed — posts corroborate context but
 * can never anchor a `high` confidence band on their own.
 */
export class BlueskyAdapter implements Adapter {
  readonly id = 'bluesky-public';
  readonly label = 'Bluesky (public search)';
  private readonly queries: string[];

  constructor(
    queries: string[] = [
      'breaking',
      'earthquake',
      'airstrike',
      'cyberattack',
      'protest',
    ],
  ) {
    this.queries = queries;
  }

  async fetch(): Promise<RawItem[]> {
    const all: RawItem[] = [];
    for (const q of this.queries) {
      const url =
        `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&limit=25&sort=latest`;
      try {
        const res = await fetch(url, {
          headers: {
            'user-agent': 'Crosscheck-Bot/1.0 (+https://crosscheck.local)',
            accept: 'application/json',
          },
        });
        if (!res.ok) {
          // Skip the individual query on a transient failure — do NOT throw,
          // or a single rate-limited query will null out the entire adapter.
          continue;
        }
        const json = (await res.json()) as { posts?: BskyPost[] };
        for (const post of json.posts ?? []) {
          const text = post.record?.text?.trim();
          if (!text) continue;
          const handle = post.author?.handle ?? 'bsky';
          const rkey = atUriRkey(post.uri);
          if (!rkey) continue;
          const webUrl = `https://bsky.app/profile/${handle}/post/${rkey}`;
          all.push({
            source_id: this.id,
            title: text.slice(0, 240),
            summary: text.length > 240 ? text.slice(0, 1000) : null,
            url: webUrl,
            published_at: post.indexedAt ?? post.record?.createdAt ?? null,
            raw: {
              platform: 'bluesky',
              query: q,
              handle,
              like_count: post.likeCount ?? 0,
              repost_count: post.repostCount ?? 0,
              reply_count: post.replyCount ?? 0,
            },
          });
        }
      } catch {
        // swallow per-query errors; the adapter as a whole returns whatever
        // succeeded. runIngest records health per-adapter, not per-query.
      }
    }
    return all;
  }
}

interface BskyPost {
  uri: string;
  indexedAt?: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  author?: { handle?: string };
  record?: { text?: string; createdAt?: string };
}

/** `at://did:plc:xxx/app.bsky.feed.post/3lxxxxx` → `3lxxxxx` */
function atUriRkey(uri: string): string | null {
  const m = uri.match(/\/([^/]+)$/);
  return m?.[1] ?? null;
}
