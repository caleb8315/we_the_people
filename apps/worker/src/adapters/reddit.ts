import type { Adapter, RawItem } from './base';

/**
 * Reddit public-JSON adapter.
 *
 * Reads one or more subreddits via the public `.json` endpoint (no auth, no
 * API key, no OAuth). Free-tier only — do not swap in the paid Data API
 * without updating the rate-limit posture and user-agent contract.
 *
 * Reddit requires a distinctive user-agent or the endpoint 429s aggressively.
 * We send a stable bot UA + version; rotate only if Reddit formally asks.
 *
 * Confidence guardrail: every item returned here is social, so the
 * domain `reddit.com` is deliberately kept OUT of the credible-source list
 * in `@osint/core/domains`. Reddit posts corroborate, they never anchor.
 */
export class RedditAdapter implements Adapter {
  readonly id = 'reddit-public';
  readonly label = 'Reddit (public hot)';
  private readonly subreddits: string[];

  constructor(
    subreddits: string[] = ['worldnews', 'news', 'breakingnews', 'OutOfTheLoop'],
  ) {
    this.subreddits = subreddits;
  }

  async fetch(): Promise<RawItem[]> {
    const url = `https://www.reddit.com/r/${this.subreddits.join('+')}/hot.json?limit=50`;
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Crosscheck-Bot/1.0 (+https://crosscheck.local)',
        accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(`reddit ${res.status}`);
    const payload = (await res.json()) as {
      data?: { children?: Array<{ data?: RedditPost }> };
    };
    const children = payload.data?.children ?? [];

    const out: RawItem[] = [];
    for (const child of children) {
      const post = child?.data;
      if (!post) continue;
      if (post.stickied || post.over_18) continue;
      const link = post.url_overridden_by_dest || post.url;
      if (!link || !post.title) continue;
      out.push({
        source_id: this.id,
        title: post.title.trim().slice(0, 500),
        summary: post.selftext ? post.selftext.slice(0, 500) : null,
        // Use the link the post points at when it's a link post; fall back to
        // the Reddit thread URL so we never drop evidence to a broken link.
        url: safeUrl(link) ? link : `https://www.reddit.com${post.permalink}`,
        published_at: post.created_utc
          ? new Date(post.created_utc * 1000).toISOString()
          : null,
        raw: {
          subreddit: post.subreddit,
          score: post.score,
          num_comments: post.num_comments,
          author: post.author,
          permalink: `https://www.reddit.com${post.permalink}`,
          platform: 'reddit',
        },
      });
    }
    return out;
  }
}

interface RedditPost {
  title: string;
  url: string;
  url_overridden_by_dest?: string;
  permalink: string;
  author: string;
  subreddit: string;
  selftext?: string;
  score: number;
  num_comments: number;
  created_utc?: number;
  stickied?: boolean;
  over_18?: boolean;
}

function safeUrl(u: string): boolean {
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}
