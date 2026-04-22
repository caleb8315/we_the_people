import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessSocialProvenance,
  buildSocialMetadata,
  canonicalizeSocialUrl,
  detectPlatform,
  isSocialUrl,
} from '../social';
import {
  assessImageProvenance,
  assessLinkProvenance,
  canonicalizeUrl,
  describeImageObservation,
} from '../media';
import { buildConfidenceReport } from '../confidence';

describe('detectPlatform', () => {
  it('recognises X / Twitter by host', () => {
    assert.equal(detectPlatform(new URL('https://x.com/user/status/1')).platform, 'x');
    assert.equal(
      detectPlatform(new URL('https://twitter.com/user/status/1')).platform,
      'x',
    );
  });

  it('recognises Bluesky / Threads / Reddit / Mastodon / YouTube', () => {
    assert.equal(detectPlatform(new URL('https://bsky.app/profile/u/post/1')).platform, 'bluesky');
    assert.equal(detectPlatform(new URL('https://www.threads.net/@u/post/1')).platform, 'threads');
    assert.equal(detectPlatform(new URL('https://www.reddit.com/r/news/comments/abc')).platform, 'reddit');
    assert.equal(detectPlatform(new URL('https://mastodon.social/@u/11223344')).platform, 'mastodon');
    assert.equal(detectPlatform(new URL('https://youtu.be/abc123')).platform, 'youtube');
  });

  it('returns unknown for unrecognised hosts', () => {
    assert.equal(detectPlatform(new URL('https://random.example/post/1')).platform, 'unknown');
  });
});

describe('canonicalizeSocialUrl', () => {
  it('strips tracking params and normalises twitter.com → x.com', () => {
    const out = canonicalizeSocialUrl('https://twitter.com/u/status/1?utm_source=x&s=09');
    assert.equal(new URL(out).hostname, 'x.com');
    assert.equal(new URL(out).searchParams.has('utm_source'), false);
    assert.equal(new URL(out).searchParams.has('s'), false);
  });
});

describe('buildSocialMetadata', () => {
  it('extracts handle and post id for X', () => {
    const meta = buildSocialMetadata('https://x.com/nytimes/status/1234567890');
    assert.equal(meta?.platform, 'x');
    assert.equal(meta?.author_handle, 'nytimes');
    assert.equal(meta?.post_id, '1234567890');
  });

  it('returns null for non-URL inputs', () => {
    assert.equal(buildSocialMetadata('not a url'), null);
  });
});

describe('assessSocialProvenance', () => {
  it('always caps band at medium and emits a social warning', () => {
    const p = assessSocialProvenance('https://x.com/user/status/1');
    assert.ok(p);
    assert.equal(p!.cap_band_at_medium, true);
    assert.ok(p!.warnings.some((w) => /social post/i.test(w)));
  });

  it('warns on repost-like URLs', () => {
    const p = assessSocialProvenance('https://x.com/share?url=abc');
    assert.ok(p);
    assert.ok(p!.warnings.some((w) => /repost|quote/i.test(w)));
  });
});

describe('isSocialUrl', () => {
  it('returns true for recognised hosts', () => {
    assert.equal(isSocialUrl('https://x.com/u/status/1'), true);
    assert.equal(isSocialUrl('https://bsky.app/profile/u/post/1'), true);
  });
  it('returns false for unknown hosts', () => {
    assert.equal(isSocialUrl('https://random.example/post'), false);
  });
});

describe('canonicalizeUrl', () => {
  it('strips trackers and lowercases the host', () => {
    const c = canonicalizeUrl('https://WWW.Example.COM/path?utm_source=x&keep=1');
    assert.ok(c);
    assert.equal(c!.host, 'example.com');
    assert.equal(c!.stripped_params.includes('utm_source'), true);
    assert.ok(c!.url.includes('keep=1'));
  });
  it('returns null for malformed input', () => {
    assert.equal(canonicalizeUrl('not a url'), null);
  });
});

describe('assessLinkProvenance', () => {
  it('flags shorteners and aggregators', () => {
    const s = assessLinkProvenance('https://bit.ly/abc');
    assert.ok(s);
    assert.equal(s!.is_shortener, true);
    assert.ok(s!.tags.some((t) => /shortener/i.test(t)));
    const a = assessLinkProvenance('https://news.google.com/story/xyz');
    assert.ok(a);
    assert.equal(a!.is_aggregator, true);
  });
  it('flags image hosts / direct image URLs', () => {
    const img = assessLinkProvenance('https://i.imgur.com/abc.jpg');
    assert.ok(img);
    assert.equal(img!.is_image_host, true);
  });
});

describe('assessImageProvenance', () => {
  it('tags screenshot-looking filenames', () => {
    const p = assessImageProvenance({ filename: 'screenshot-123.png' });
    assert.ok(p.tags.some((t) => /screenshot/i.test(t)));
  });
  it('always tags image forensics as not run in v1', () => {
    const p = assessImageProvenance({ url: 'https://example.com/a.jpg' });
    assert.ok(p.tags.some((t) => /photo manipulation|AI generation/i.test(t)));
  });
});

describe('describeImageObservation', () => {
  it('tags a brand-new hash as first-seen', () => {
    const tags = describeImageObservation(null, 'example.com');
    assert.ok(tags.some((t) => /first time/i.test(t)));
  });

  it('reports the prior observation count', () => {
    const iso = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const tags = describeImageObservation(
      {
        first_seen_at: iso,
        last_seen_at: iso,
        observation_count: 2,
        seen_hosts: ['example.com'],
        first_host: 'example.com',
      },
      'example.com',
    );
    assert.ok(tags.some((t) => /seen this exact image 2 times before/i.test(t)));
  });

  it('flags context mismatch when the hash appeared on other hosts', () => {
    const iso = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const tags = describeImageObservation(
      {
        first_seen_at: iso,
        last_seen_at: iso,
        observation_count: 2,
        seen_hosts: ['reuters.com', 'example.com'],
        first_host: 'reuters.com',
      },
      'example.com',
    );
    assert.ok(tags.some((t) => /previously posted on|reused out of context/i.test(t)));
  });

  it('flags repeated reuse on the same host', () => {
    const iso = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const tags = describeImageObservation(
      {
        first_seen_at: iso,
        last_seen_at: iso,
        observation_count: 5,
        seen_hosts: ['example.com'],
        first_host: 'example.com',
      },
      'example.com',
    );
    assert.ok(tags.some((t) => /keeps getting reposted/i.test(t)));
  });
});

describe('buildConfidenceReport — Phase 2 guardrails', () => {
  it('caps band at medium when cap_band_at_medium is true, even with a high score', () => {
    const report = buildConfidenceReport({
      verification_status: 'verified',
      reliability_score: 90,
      reliability_label: 'LIKELY_ACCURATE',
      evidence: [
        {
          source_id: null,
          url: 'https://x.com/u/status/1',
          domain: 'x.com',
          title: null,
          published_at: null,
          is_credible: false,
          excerpt: null,
        },
      ],
      contradictions: [],
      physical_evidence: null,
      source_count: 1,
      credible_source_count: 0,
      cap_band_at_medium: true,
      provenance_warnings: ['Social submission — awaiting corroboration.'],
    });
    assert.equal(report.band, 'medium');
    assert.ok(
      report.explanation_bullets.some((b) => /social submission|corroboration/i.test(b)),
    );
  });
});
