/**
 * Social provenance analysis (Phase 2).
 *
 * Purpose: when a user pastes a social URL, a quoted snippet, or a screenshot
 * link into the verify flow, we need to produce:
 *   - a structured description of the social item (platform, handle, id,
 *     repost chain, media presence),
 *   - provenance warnings that the confidence engine feeds into its bullets,
 *   - and a canonical URL that the existing verification engine can treat
 *     like any other evidence row.
 *
 * Strict editorial rule: social-only evidence NEVER reaches the `high`
 * confidence band on its own. The provenance warnings below are the
 * deterministic levers that keep social submissions honest — they are read
 * by the verify route and merged into the confidence report's explanation
 * bullets without any LLM call.
 *
 * This module is LLM-free, network-free, and deterministic.
 */

export type SocialPlatform =
  | 'x'
  | 'bluesky'
  | 'mastodon'
  | 'threads'
  | 'reddit'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'unknown';

export interface SocialItemMetadata {
  platform: SocialPlatform;
  /** Canonical URL (without tracking params). Falls back to input URL. */
  canonical_url: string;
  /** Best-effort handle / account name extracted from the URL. */
  author_handle: string | null;
  /** Best-effort post id (platform-specific). */
  post_id: string | null;
  /** True when the URL points at a repost / quote / embed. */
  is_repost_like: boolean;
  /** True when the path hints at media content (image, video). */
  has_media_in_path: boolean;
  /** Human-readable platform label for UI. */
  platform_label: string;
}

export interface SocialProvenance extends SocialItemMetadata {
  /** Provenance warnings — fed straight into confidence bullets. */
  warnings: string[];
  /**
   * Guardrail flag. When true, the verification route MUST cap the
   * confidence band at `medium` regardless of what the reliability math
   * says. We never let a single pasted post produce high confidence.
   */
  cap_band_at_medium: boolean;
}

const PLATFORM_HOSTS: Array<{ match: RegExp; platform: SocialPlatform; label: string }> = [
  { match: /(^|\.)twitter\.com$/i, platform: 'x', label: 'X (Twitter)' },
  { match: /(^|\.)x\.com$/i, platform: 'x', label: 'X (Twitter)' },
  { match: /(^|\.)bsky\.app$/i, platform: 'bluesky', label: 'Bluesky' },
  { match: /(^|\.)threads\.net$/i, platform: 'threads', label: 'Threads' },
  { match: /(^|\.)reddit\.com$/i, platform: 'reddit', label: 'Reddit' },
  { match: /(^|\.)facebook\.com$/i, platform: 'facebook', label: 'Facebook' },
  { match: /(^|\.)instagram\.com$/i, platform: 'instagram', label: 'Instagram' },
  { match: /(^|\.)tiktok\.com$/i, platform: 'tiktok', label: 'TikTok' },
  { match: /(^|\.)youtube\.com$/i, platform: 'youtube', label: 'YouTube' },
  { match: /(^|\.)youtu\.be$/i, platform: 'youtube', label: 'YouTube' },
];

// Mastodon uses many instances; match by path shape `/@handle/postId`.
const MASTODON_PATH_RX = /^\/@[A-Za-z0-9_.-]+\/\d+$/;

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'ref_src',
  'ref_url',
  's',
  't',
]);

const MEDIA_PATH_HINTS = /\/(video|photo|reel|tv|clip|shorts)\b/i;

export function detectPlatform(url: URL): { platform: SocialPlatform; label: string } {
  const host = url.hostname.toLowerCase();
  for (const p of PLATFORM_HOSTS) {
    if (p.match.test(host)) return { platform: p.platform, label: p.label };
  }
  if (MASTODON_PATH_RX.test(url.pathname)) return { platform: 'mastodon', label: 'Mastodon' };
  return { platform: 'unknown', label: host };
}

export function canonicalizeSocialUrl(input: string): string {
  try {
    const u = new URL(input);
    // Drop tracking params in place — do not rewrite the host or path.
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    // Normalize twitter.com → x.com so cluster keys match.
    if (/(^|\.)twitter\.com$/i.test(u.hostname)) {
      u.hostname = u.hostname.replace(/twitter\.com$/i, 'x.com');
    }
    return u.toString();
  } catch {
    return input;
  }
}

function extractHandle(url: URL, platform: SocialPlatform): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  switch (platform) {
    case 'x':
    case 'threads':
      return segments[0]?.replace(/^@/, '') ?? null;
    case 'bluesky':
      return segments[1] ?? null; // /profile/<handle>/post/<id>
    case 'mastodon':
      return segments[0]?.replace(/^@/, '') ?? null;
    case 'reddit':
      return segments[1] ?? segments[0] ?? null;
    case 'facebook':
    case 'instagram':
    case 'tiktok':
    case 'youtube':
      return segments[0]?.replace(/^@/, '') ?? null;
    default:
      return null;
  }
}

function extractPostId(url: URL, platform: SocialPlatform): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  switch (platform) {
    case 'x':
    case 'threads': {
      const i = segments.indexOf('status');
      if (i >= 0 && segments[i + 1]) return segments[i + 1] ?? null;
      const statusesIdx = segments.indexOf('statuses');
      if (statusesIdx >= 0 && segments[statusesIdx + 1]) return segments[statusesIdx + 1] ?? null;
      return segments[segments.length - 1] ?? null;
    }
    case 'bluesky': {
      const postIdx = segments.indexOf('post');
      return postIdx >= 0 ? segments[postIdx + 1] ?? null : null;
    }
    case 'mastodon':
      return segments[1] ?? null;
    case 'reddit': {
      const commentsIdx = segments.indexOf('comments');
      return commentsIdx >= 0 ? segments[commentsIdx + 1] ?? null : null;
    }
    case 'youtube': {
      const v = url.searchParams.get('v');
      if (v) return v;
      return segments[segments.length - 1] ?? null;
    }
    default:
      return segments[segments.length - 1] ?? null;
  }
}

function detectRepostLike(url: URL, platform: SocialPlatform): boolean {
  const p = url.pathname.toLowerCase();
  if (platform === 'x' && /\/status\//i.test(p) && url.searchParams.get('ref_src')) return true;
  if (/\/quote|\/retweet|\/share|\/intent\/retweet|\/embed/i.test(p)) return true;
  return false;
}

export function buildSocialMetadata(input: string): SocialItemMetadata | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const { platform, label } = detectPlatform(url);
  const canonical_url = canonicalizeSocialUrl(input);
  return {
    platform,
    canonical_url,
    author_handle: extractHandle(url, platform),
    post_id: extractPostId(url, platform),
    is_repost_like: detectRepostLike(url, platform),
    has_media_in_path: MEDIA_PATH_HINTS.test(url.pathname),
    platform_label: label,
  };
}

/**
 * Evaluate provenance for a social submission. Returns `null` when the URL
 * is unusable. When it returns a record, the verify route MUST merge the
 * warnings into the confidence report bullets and honor `cap_band_at_medium`.
 */
export function assessSocialProvenance(input: string): SocialProvenance | null {
  const meta = buildSocialMetadata(input);
  if (!meta) return null;
  const warnings: string[] = [];

  warnings.push(
    'This is a social post — we never rate it on its own. Confidence stays at or below “mixed” until we find other independent sources covering the same story.',
  );

  if (meta.platform === 'unknown') {
    warnings.push('We don\u2019t recognise this platform, so we couldn\u2019t pull author or post details.');
  }
  if (!meta.author_handle) {
    warnings.push('We couldn\u2019t tell who posted this from the URL alone.');
  }
  if (meta.is_repost_like) {
    warnings.push('This looks like a repost or quote, not the original — we haven\u2019t checked the original post.');
  }
  if (meta.has_media_in_path) {
    warnings.push('The post includes a photo or video. We don\u2019t check those for manipulation yet.');
  }

  return {
    ...meta,
    warnings,
    cap_band_at_medium: true,
  };
}

/**
 * Return true when a URL is recognised as social. Used by the evidence
 * pipeline to mark items as social-origin so the confidence band never
 * surges to `high` based on social alone.
 */
export function isSocialUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const { platform } = detectPlatform(u);
    return platform !== 'unknown';
  } catch {
    return false;
  }
}
