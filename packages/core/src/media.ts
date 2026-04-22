/**
 * Media + link provenance utilities (Phase 3).
 *
 * Deterministic, network-free provenance checks for any URL or inline image
 * the user submits via `/verify`. Used by both the social verification path
 * (Phase 2) and the image/link path (Phase 3) so both surfaces share one
 * contract.
 *
 * This module never asserts factual truth about an image or URL. It emits
 * *explainability tags* (short phrases) that the confidence engine turns
 * into plain-language bullets.
 */

export interface CanonicalizedUrl {
  /** Input after stripping trackers and normalising the host. */
  url: string;
  /** Host in lower-case, no `www.` prefix. */
  host: string;
  /** True when the canonicalized URL differs from the raw input. */
  changed: boolean;
  /** Parameters stripped from the input during canonicalization. */
  stripped_params: string[];
}

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'yclid',
  'ref_src',
  'ref_url',
  'spm',
  's',
  't',
  'igshid',
  'share',
]);

export function canonicalizeUrl(input: string): CanonicalizedUrl | null {
  try {
    const u = new URL(input);
    const stripped: string[] = [];
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        stripped.push(key);
        u.searchParams.delete(key);
      }
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    u.hostname = host;
    const out = u.toString();
    return {
      url: out,
      host,
      changed: out !== input || stripped.length > 0,
      stripped_params: stripped,
    };
  } catch {
    return null;
  }
}

export interface LinkProvenance {
  host: string;
  canonical_url: string;
  stripped_params: string[];
  is_shortener: boolean;
  is_image_host: boolean;
  is_aggregator: boolean;
  /** Plain-language explainability tags. Safe to render directly. */
  tags: string[];
}

const SHORTENER_HOSTS = new Set([
  'bit.ly',
  't.co',
  'goo.gl',
  'tinyurl.com',
  'buff.ly',
  'ow.ly',
  'ift.tt',
  'dlvr.it',
  'trib.al',
  'bit.do',
  'rebrand.ly',
  'lnkd.in',
]);

const IMAGE_HOST_RX =
  /\.(jpe?g|png|webp|gif|avif|heic|tiff?)(\?|$)/i;

const IMAGE_HOSTS = new Set([
  'i.imgur.com',
  'imgur.com',
  'pbs.twimg.com',
  'media.discordapp.net',
  'cdn.discordapp.com',
  'i.redd.it',
  'i.ibb.co',
]);

const AGGREGATOR_HOSTS = new Set([
  'news.google.com',
  'flipboard.com',
  'apple.news',
  'smartnews.com',
]);

export function assessLinkProvenance(input: string): LinkProvenance | null {
  const c = canonicalizeUrl(input);
  if (!c) return null;
  const is_shortener = SHORTENER_HOSTS.has(c.host);
  const is_aggregator = AGGREGATOR_HOSTS.has(c.host);
  const is_image_host = IMAGE_HOSTS.has(c.host) || IMAGE_HOST_RX.test(c.url);
  const tags: string[] = [];
  if (is_shortener) {
    tags.push('The link goes through a shortener — we can\u2019t see the real destination without following it.');
  }
  if (is_aggregator) {
    tags.push('This is a news aggregator, not the original publisher. The underlying outlet wasn\u2019t checked.');
  }
  if (is_image_host) {
    tags.push('This link points straight to an image, not an article — no story context is attached.');
  }
  // Tracking-param stripping is plumbing, not a user-facing concern. We still
  // record `stripped_params` on the provenance record for debugging, but we
  // no longer emit a user bullet for it.
  return {
    host: c.host,
    canonical_url: c.url,
    stripped_params: c.stripped_params,
    is_shortener,
    is_image_host,
    is_aggregator,
    tags,
  };
}

export interface ImageProvenance {
  /** SHA-256 hex of the bytes, when we had the bytes; otherwise null. */
  sha256: string | null;
  /** Byte length when known. */
  byte_length: number | null;
  /** Host of the image URL (or null when inline bytes). */
  host: string | null;
  /** True when the image looks like a screenshot (dimension hint / filename). */
  looks_like_screenshot: boolean;
  /** Plain-language explainability tags. */
  tags: string[];
}

/**
 * Prior-observation snapshot for an image hash. `null` means this hash has
 * never been seen by the platform — the caller should still record the
 * observation so future submissions can match.
 */
export interface ImageObservationSnapshot {
  first_seen_at: string;
  last_seen_at: string;
  observation_count: number;
  seen_hosts: string[];
  first_host: string | null;
}

/**
 * Turn a prior-observation snapshot into plain-language explainability
 * tags. Deterministic and network-free — exactly what the confidence
 * engine consumes.
 */
export function describeImageObservation(
  prior: ImageObservationSnapshot | null,
  current_host: string | null,
): string[] {
  const tags: string[] = [];
  if (!prior) {
    tags.push('First time we\u2019ve seen this image.');
    return tags;
  }
  const times = prior.observation_count === 1 ? 'once' : `${prior.observation_count} times`;
  tags.push(
    `We\u2019ve seen this exact image ${times} before (first on ${formatRelative(prior.first_seen_at)}).`,
  );
  const normalizedCurrent = current_host?.toLowerCase().replace(/^www\./, '') ?? null;
  const otherHosts = prior.seen_hosts.filter(
    (h) => h && h !== normalizedCurrent,
  );
  if (otherHosts.length > 0) {
    const sample = otherHosts.slice(0, 2).join(', ');
    const extra = otherHosts.length > 2 ? ` (and ${otherHosts.length - 2} more)` : '';
    tags.push(
      `Heads up: this image was previously posted on ${sample}${extra} — it may be getting reused out of context.`,
    );
  }
  if (prior.observation_count >= 3 && otherHosts.length === 0) {
    tags.push('This image keeps getting reposted on the same site.');
  }
  return tags;
}

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const diffMs = Date.now() - then;
  const day = 86_400_000;
  if (diffMs < day) return 'earlier today';
  const days = Math.floor(diffMs / day);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

const SCREENSHOT_FILENAME_RX = /(screenshot|screen[- ]cap|grab|capture)/i;

export function assessImageProvenance(opts: {
  url?: string | null;
  filename?: string | null;
  sha256?: string | null;
  byte_length?: number | null;
}): ImageProvenance {
  const tags: string[] = [];
  let host: string | null = null;
  if (opts.url) {
    try {
      host = new URL(opts.url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      host = null;
    }
  }
  const looks_like_screenshot =
    (opts.filename && SCREENSHOT_FILENAME_RX.test(opts.filename)) ||
    (opts.url ? SCREENSHOT_FILENAME_RX.test(opts.url) : false) ||
    false;

  if (looks_like_screenshot) {
    tags.push('This looks like a screenshot — the original post or article isn\u2019t attached.');
  }
  if (!opts.sha256) {
    tags.push('We can\u2019t check whether this image has been used elsewhere without a file fingerprint.');
  }
  if (host && ['imgur.com', 'i.imgur.com', 'pbs.twimg.com'].includes(host)) {
    tags.push('The image is on an image host, so we can\u2019t tell when or where it was first published.');
  }
  tags.push('We don\u2019t yet inspect images for photo manipulation or AI generation.');

  return {
    sha256: opts.sha256 ?? null,
    byte_length: opts.byte_length ?? null,
    host,
    looks_like_screenshot,
    tags,
  };
}
