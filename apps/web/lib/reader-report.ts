/**
 * Reader Report (Phase 8) — plain-English verification output.
 *
 * The `ConfidenceReport` contract in `@osint/core` is the deterministic
 * engine talking to itself: bands, scores, bullets, source trace. Fine
 * for APIs and internal surfaces, but it produces phrases like
 * "One credible outlet is reporting; awaiting independent corroboration"
 * and source-trace rows like `[primary] media.cnn.com`.
 *
 * A Reader Report is what the engine output *means* to a normal person:
 *
 *     - What is this thing I submitted?
 *     - What does the evidence actually say?
 *     - What's still unclear or limited?
 *     - So what should I do with this?
 *
 * Build rules:
 *   - Deterministic. No LLM, no paraphrase. Every string is a templated
 *     composition of counts + factual labels from the underlying report.
 *   - Never asserts truth. We summarize *corroboration*, not reality.
 *   - Plain language. No "credible-tier", no "byte hash", no "canonical
 *     URL", no "[primary]" tags. If a product manager would ask "wtf does
 *     that mean?", it doesn't belong here.
 */

import type { ConfidenceBand, ConfidenceReport, SourceTraceEntry } from '@osint/core';
import { isCredibleDomain } from '@osint/core';

export interface ReaderBullet {
  text: string;
  tone: 'info' | 'good' | 'warn';
}

export interface SourceMix {
  total: number;
  established_outlets: number;
  social_posts: number;
  sensor_events: number;
  reference_hits: number;
  other: number;
}

export interface SourceTraceFriendly {
  role_label: string;
  domain: string;
  outlet_label: string;
  url: string;
  title: string | null;
  is_credible: boolean;
}

export interface ReaderReport {
  headline: string;
  kind_label: string;
  one_liner: string;

  band: ConfidenceBand;
  band_label: string;
  band_summary: string;

  what_we_found: ReaderBullet[];
  what_is_unclear: ReaderBullet[];

  bottom_line: string;

  source_mix: SourceMix;
  source_trace_friendly: SourceTraceFriendly[];
}

export interface ReaderReportInput {
  confidence: ConfidenceReport;
  input: {
    kind: 'url' | 'text' | 'image';
    canonical_url: string | null;
    host: string | null;
    headline: string | null;
    preview_text: string | null;
    is_social: boolean;
    social_platform_label: string | null;
    image_filename: string | null;
    has_image_hash: boolean;
  };
  corroboration: {
    systems: Array<{
      id: string;
      name: string;
      status: 'hit' | 'miss' | 'skipped' | 'unavailable' | 'error';
      hits: number;
      note: string;
      evidence_count: number;
    }>;
    matched_signal: {
      id: string;
      title: string;
      source_count: number;
      credible_source_count: number;
    } | null;
  };
  /**
   * Plain-language limits / warnings lifted from the provenance layer
   * (image, link, social). Caller should pass them as-is — they are
   * already user-safe strings from `assessImageProvenance` et al.
   */
  provenance_limits: string[];
}

/** Build a Reader Report from the engine's output + live-systems coverage. */
export function buildReaderReport(input: ReaderReportInput): ReaderReport {
  const { confidence, input: ctx, corroboration, provenance_limits } = input;

  const headline = pickHeadline(ctx);
  const kind_label = pickKindLabel(ctx);
  const one_liner = pickOneLiner(ctx, corroboration);

  const source_mix = buildSourceMix(confidence, corroboration);
  const what_we_found = buildFindings(confidence, corroboration, source_mix);
  const what_is_unclear = buildUnclear(confidence, corroboration, provenance_limits, ctx);
  const bottom_line = buildBottomLine(confidence.band, source_mix, corroboration);

  return {
    headline,
    kind_label,
    one_liner,

    band: confidence.band,
    band_label: confidence.label_display,
    band_summary: confidence.summary,

    what_we_found,
    what_is_unclear,

    bottom_line,

    source_mix,
    source_trace_friendly: friendlySourceTrace(confidence.source_trace),
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function pickHeadline(ctx: ReaderReportInput['input']): string {
  if (ctx.headline && ctx.headline.trim().length > 0) return ctx.headline.trim();
  if (ctx.kind === 'text' && ctx.preview_text) {
    return ctx.preview_text.slice(0, 140);
  }
  if (ctx.kind === 'image') {
    return ctx.image_filename ? `Image: ${ctx.image_filename}` : 'Image submission';
  }
  if (ctx.host) return `Submission from ${ctx.host}`;
  return 'Verification result';
}

function pickKindLabel(ctx: ReaderReportInput['input']): string {
  if (ctx.kind === 'image') return 'Image submission';
  if (ctx.kind === 'text') return 'Pasted claim';
  if (ctx.is_social && ctx.social_platform_label) {
    return `Social post on ${ctx.social_platform_label}`;
  }
  if (ctx.host) {
    return `News article from ${prettyOutletName(ctx.host)}`;
  }
  return 'Web link';
}

function pickOneLiner(
  ctx: ReaderReportInput['input'],
  corroboration: ReaderReportInput['corroboration'],
): string {
  if (corroboration.matched_signal) {
    const ms = corroboration.matched_signal;
    if (ms.source_count >= 3) {
      return `This event is already on our radar — ${ms.source_count} sources are covering it. Here\u2019s what we know about how well it\u2019s backed up.`;
    }
    return `We\u2019re already tracking this event. Here\u2019s how the reporting holds up across independent sources.`;
  }
  if (ctx.kind === 'image') {
    return ctx.host
      ? `We looked into this image from ${prettyOutletName(ctx.host)}. Without the article or post it came from, there\u2019s limited context to verify \u2014 sharing that link next time gives us much more to work with.`
      : 'We looked into this image, but without the post or article it came from, there\u2019s limited context. Sharing the original link next time gives us much more to work with.';
  }
  if (ctx.kind === 'text') {
    return 'We searched for this claim across news outlets, social feeds, and sensor networks. Without a source link, we\u2019re matching on the wording alone.';
  }
  if (ctx.is_social) {
    return `This came from a ${ctx.social_platform_label ?? 'social media'} post. Social posts aren\u2019t news reporting on their own, so we looked for independent sources covering the same thing.`;
  }
  if (ctx.host) {
    return `We checked whether other outlets, social feeds, and sensor networks independently back up this reporting from ${prettyOutletName(ctx.host)}.`;
  }
  return 'We searched news outlets, social feeds, and sensor networks to see how well this holds up.';
}

function buildSourceMix(
  confidence: ConfidenceReport,
  corroboration: ReaderReportInput['corroboration'],
): SourceMix {
  const systemsById = new Map(corroboration.systems.map((s) => [s.id, s] as const));
  const trackedCount = systemsById.get('tracked_events')?.evidence_count ?? 0;
  const webCount = systemsById.get('web')?.evidence_count ?? 0;
  const gdeltCount = systemsById.get('gdelt')?.evidence_count ?? 0;
  const redditCount = systemsById.get('reddit')?.evidence_count ?? 0;
  const blueskyCount = systemsById.get('bluesky')?.evidence_count ?? 0;
  const wikiCount = systemsById.get('wikipedia')?.evidence_count ?? 0;
  const sensorCount = systemsById.get('sensors')?.evidence_count ?? 0;

  return {
    total: confidence.source_trace.length > 0 ? Math.max(confidence.source_trace.length, trackedCount + webCount + gdeltCount + redditCount + blueskyCount + wikiCount + sensorCount) : confidence.source_trace.length,
    established_outlets: confidence.source_trace.filter((t) => t.is_credible && t.role !== 'sensor').length,
    social_posts: redditCount + blueskyCount,
    sensor_events: sensorCount,
    reference_hits: wikiCount + gdeltCount,
    other: Math.max(0, confidence.source_trace.filter((t) => !t.is_credible && t.role !== 'sensor').length - (redditCount + blueskyCount + wikiCount)),
  };
}

function buildFindings(
  confidence: ConfidenceReport,
  corroboration: ReaderReportInput['corroboration'],
  mix: SourceMix,
): ReaderBullet[] {
  const out: ReaderBullet[] = [];

  let outletsStated = false;
  if (corroboration.matched_signal) {
    const ms = corroboration.matched_signal;
    const others = Math.max(0, ms.source_count - ms.credible_source_count);
    let body: string;
    if (ms.credible_source_count >= 2) {
      body = others > 0
        ? `${ms.credible_source_count} established news outlets are independently covering this event, plus ${others} additional source${others === 1 ? '' : 's'}. That level of independent coverage is a strong sign the core event is real.`
        : `${ms.credible_source_count} established news outlets are independently covering this event. When multiple reputable outlets report the same thing, the basic facts are usually solid.`;
    } else if (ms.credible_source_count === 1) {
      body = others > 0
        ? `One established outlet is reporting this, along with ${others === 1 ? 'one other source' : `${others} other sources`} we haven\u2019t vetted. A single confirmed outlet is a start, but watch for more to pick it up.`
        : 'One established outlet is reporting this so far. We\u2019re watching for others to independently confirm.';
    } else if (ms.source_count >= 2) {
      body = `${ms.source_count} sources are covering this, though none are outlets we\u2019ve vetted yet. The coverage exists, but check each source\u2019s credibility yourself.`;
    } else {
      body = `${ms.source_count} source${ms.source_count === 1 ? ' is' : 's are'} covering this event.`;
    }
    out.push({ tone: ms.credible_source_count >= 2 ? 'good' : 'info', text: body });
    outletsStated = true;
  }

  if (!outletsStated) {
    const others = Math.max(0, mix.total - mix.established_outlets);
    if (mix.established_outlets >= 2) {
      out.push({
        tone: 'good',
        text: others > 0
          ? `${mix.established_outlets} established outlets are reporting this independently, plus ${others} other source${others === 1 ? '' : 's'}. Multiple reputable outlets covering the same event is a strong trust signal.`
          : `${mix.established_outlets} established outlets are independently reporting the same event. That kind of agreement across newsrooms makes the core facts much more trustworthy.`,
      });
    } else if (mix.established_outlets === 1) {
      out.push({
        tone: 'info',
        text: others > 0
          ? `One established outlet is reporting this, plus ${others} unvetted source${others === 1 ? '' : 's'}. Not enough for full confidence yet \u2014 check each source yourself.`
          : 'One established outlet has this so far. Promising, but we\u2019re waiting to see if others independently confirm.',
      });
    } else if (mix.total >= 5) {
      out.push({
        tone: 'info',
        text: `${mix.total} sources are covering this, but none are outlets we\u2019ve vetted. That doesn\u2019t automatically mean they\u2019re wrong \u2014 many real stories break outside major outlets \u2014 but read each source carefully.`,
      });
    } else if (mix.total >= 2) {
      out.push({
        tone: 'info',
        text: `${mix.total} sources mention this. We haven\u2019t vetted any of them yet, so judge each on its own merits before drawing conclusions.`,
      });
    }
  }

  const systemsById = new Map(corroboration.systems.map((s) => [s.id, s] as const));
  const gdelt = systemsById.get('gdelt');
  if (gdelt && gdelt.status === 'hit') {
    out.push({
      tone: 'good',
      text: `This is getting international attention \u2014 ${gdelt.evidence_count} outlets worldwide have covered it in the last few days, according to the GDELT global news archive.`,
    });
  }

  if (mix.social_posts > 0) {
    const plural = mix.social_posts === 1 ? 'post' : 'posts';
    out.push({
      tone: 'info',
      text: `There\u2019s public discussion happening \u2014 ${mix.social_posts} matching ${plural} on Reddit or Bluesky. Social chatter shows awareness but isn\u2019t evidence on its own.`,
    });
  }

  const wiki = systemsById.get('wikipedia');
  if (wiki && wiki.status === 'hit' && wiki.evidence_count > 0) {
    out.push({
      tone: 'info',
      text: 'There\u2019s relevant Wikipedia background on this topic. Useful for understanding context, though Wikipedia itself isn\u2019t a primary news source.',
    });
  }

  if (mix.sensor_events > 0) {
    const plural = mix.sensor_events === 1 ? 'event' : 'events';
    out.push({
      tone: 'good',
      text: `Physical sensor networks detected ${mix.sensor_events} ${plural} that align with this story. Sensor data is objective measurement, not reporting \u2014 it\u2019s some of the strongest evidence available.`,
    });
  }

  const contradictionBullet = confidence.explanation_bullets.find((b) =>
    /disagree/i.test(b),
  );
  if (contradictionBullet) {
    out.push({ tone: 'warn', text: contradictionBullet });
  }

  if (out.length === 0) {
    out.push({
      tone: 'info',
      text: 'We couldn\u2019t find any corroborating coverage anywhere. This could mean it\u2019s too new to have spread, it\u2019s very niche, or the claim doesn\u2019t match anything we can verify. Treat it as unconfirmed for now.',
    });
  }
  return out.slice(0, 5);
}

function buildUnclear(
  confidence: ConfidenceReport,
  corroboration: ReaderReportInput['corroboration'],
  provenance_limits: string[],
  ctx: ReaderReportInput['input'],
): ReaderBullet[] {
  const out: ReaderBullet[] = [];
  const systemsById = new Map(corroboration.systems.map((s) => [s.id, s] as const));

  if (ctx.kind === 'image') {
    out.push({
      tone: 'warn',
      text: 'This is an image-only submission. Without the original post or article for context, our ability to verify is very limited. Next time, share the full link if you can.',
    });
  }
  if (ctx.kind === 'text') {
    out.push({
      tone: 'warn',
      text: 'There\u2019s no source link attached, so we can only match on the wording. Including a URL to the original source would let us check credibility directly.',
    });
  }
  if (ctx.is_social && !corroboration.matched_signal) {
    out.push({
      tone: 'warn',
      text: 'This is from social media, which isn\u2019t the same as professional reporting. We looked for news outlets independently covering the same event but haven\u2019t found a match yet.',
    });
  }

  const web = systemsById.get('web');
  if (web && web.status === 'unavailable') {
    out.push({
      tone: 'info',
      text: 'Our broad web search capability is temporarily offline. We still checked news archives, social feeds, and sensors, but may have missed some coverage.',
    });
  }

  const sensors = systemsById.get('sensors');
  if (sensors && sensors.status === 'miss') {
    out.push({
      tone: 'info',
      text: 'Open sensor networks (earthquakes, fires, severe weather) don\u2019t show anything matching this event. If this were a physical disaster, sensors would usually detect it.',
    });
  }

  const saidNoSource = out.some((o) => /no source link|no source/i.test(o.text));
  for (const l of provenance_limits) {
    if (!l) continue;
    if (out.some((o) => o.text === l)) continue;
    if (saidNoSource && /no source attribution|source attribution|wording alone|claim shape/i.test(l)) continue;
    out.push({ tone: 'warn', text: l });
  }

  for (const b of confidence.explanation_bullets) {
    if (/sources? (is|are) reporting|outlets? on our trusted-source list|independent sources are reporting|Only one source is reporting/i.test(b)) continue;
    if (/disagree/i.test(b)) continue;
    if (/sensor networks/i.test(b)) continue;
    if (/picked up/i.test(b)) continue;
    if (saidNoSource && /no source attribution|source attribution|wording alone|claim shape/i.test(b)) continue;
    if (out.some((o) => o.text === b)) continue;
    out.push({ tone: 'warn', text: b });
  }

  return out.slice(0, 5);
}

function buildBottomLine(
  band: ConfidenceBand,
  mix: SourceMix,
  corroboration: ReaderReportInput['corroboration'],
): string {
  switch (band) {
    case 'high':
      if (mix.sensor_events > 0) {
        return 'This event is well-supported. Multiple established news outlets are independently reporting the same thing, and physical sensor data lines up with the claims. You can share this with reasonable confidence in the basic facts.';
      }
      return 'This event is well-supported. Multiple established news outlets are independently reporting the same thing. The core facts are likely accurate, though specific details may still evolve as coverage continues.';
    case 'contested':
      return 'Sources are contradicting each other on key details. The event itself may be real, but the specifics are in dispute. We\u2019d recommend waiting before sharing \u2014 the picture should become clearer as reporting settles.';
    case 'medium':
      if (corroboration.matched_signal) {
        return 'The event appears to be real, but the full picture is still coming together. The broad strokes are backed up, though some details aren\u2019t independently confirmed yet. Worth following, but be cautious about specifics.';
      }
      if (mix.established_outlets === 0 && mix.total >= 5) {
        return `Multiple sources are covering this, but none are major outlets we\u2019ve vetted. That doesn\u2019t mean it\u2019s wrong \u2014 stories often break outside the mainstream \u2014 but read the sources yourself before taking specifics at face value.`;
      }
      if (mix.established_outlets === 1) {
        return 'One major outlet has picked this up, along with some other sources. That\u2019s a promising sign, but we\u2019d want to see more independent confirmation before considering the details reliable.';
      }
      return 'This appears to be a developing story. The general shape looks plausible, but no single claim has enough independent backing yet to be confident about. Keep watching for updates.';
    case 'low':
      if (mix.total === 0) {
        return 'We couldn\u2019t find any independent reporting on this anywhere. It could be too new to have spread, very niche, or inaccurate. Treat it as unverified and check back later.';
      }
      if (mix.total === 1) {
        return 'Only one source is reporting this so far. That\u2019s not enough to judge reliability. Check who published it, look at their track record, and wait for other outlets to pick it up before trusting the details.';
      }
      return `A few sources mention this, but we haven\u2019t been able to confirm any of them are established outlets. Read each one carefully and form your own judgement \u2014 don\u2019t treat this as confirmed.`;
  }
}

function friendlySourceTrace(trace: SourceTraceEntry[]): SourceTraceFriendly[] {
  return trace.map((t) => ({
    role_label: friendlyRole(t.role),
    domain: t.domain,
    outlet_label: prettyOutletName(t.domain),
    url: t.url,
    title: t.title,
    is_credible: t.is_credible || isCredibleDomain(t.domain),
  }));
}

function friendlyRole(role: SourceTraceEntry['role']): string {
  switch (role) {
    case 'primary':
      return 'Main report';
    case 'corroborating':
      return 'Backs this up';
    case 'conflicting':
      return 'Disagrees';
    case 'sensor':
      return 'Sensor network';
  }
}

// ─── outlet name prettifier ────────────────────────────────────────────────

const OUTLET_NAMES: Record<string, string> = {
  'cnn.com': 'CNN',
  'media.cnn.com': 'CNN',
  'edition.cnn.com': 'CNN',
  'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC',
  'news.bbc.co.uk': 'BBC',
  'reuters.com': 'Reuters',
  'apnews.com': 'Associated Press',
  'ap.org': 'Associated Press',
  'nytimes.com': 'The New York Times',
  'washingtonpost.com': 'The Washington Post',
  'wsj.com': 'The Wall Street Journal',
  'npr.org': 'NPR',
  'theguardian.com': 'The Guardian',
  'aljazeera.com': 'Al Jazeera',
  'foxnews.com': 'Fox News',
  'cbsnews.com': 'CBS News',
  'nbcnews.com': 'NBC News',
  'abcnews.go.com': 'ABC News',
  'usatoday.com': 'USA Today',
  'politico.com': 'Politico',
  'thehill.com': 'The Hill',
  'bloomberg.com': 'Bloomberg',
  'ft.com': 'Financial Times',
  'economist.com': 'The Economist',
  'france24.com': 'France 24',
  'dw.com': 'DW',
  'euronews.com': 'Euronews',
  'scmp.com': 'South China Morning Post',
  'japantimes.co.jp': 'The Japan Times',
  'abc.net.au': 'ABC News Australia',
  'cbc.ca': 'CBC',
  'reliefweb.int': 'ReliefWeb',
  'usgs.gov': 'USGS',
  'earthquake.usgs.gov': 'USGS Earthquakes',
  'volcanoes.usgs.gov': 'USGS Volcanoes',
  'eonet.gsfc.nasa.gov': 'NASA EONET',
  'nasa.gov': 'NASA',
  'noaa.gov': 'NOAA',
  'api.weather.gov': 'NOAA Weather',
  'weather.gov': 'NOAA Weather',
  'swpc.noaa.gov': 'NOAA Space Weather',
  'reddit.com': 'Reddit',
  'bsky.app': 'Bluesky',
  'wikipedia.org': 'Wikipedia',
  'en.wikipedia.org': 'Wikipedia',
  // Tech
  'techcrunch.com': 'TechCrunch',
  'theverge.com': 'The Verge',
  'arstechnica.com': 'Ars Technica',
  'wired.com': 'Wired',
  'engadget.com': 'Engadget',
  'zdnet.com': 'ZDNet',
  'technologyreview.com': 'MIT Technology Review',
  'venturebeat.com': 'VentureBeat',
  '9to5mac.com': '9to5Mac',
  '9to5google.com': '9to5Google',
  'restofworld.org': 'Rest of World',
  'openai.com': 'OpenAI',
  // Finance
  'cnbc.com': 'CNBC',
  'marketwatch.com': 'MarketWatch',
  'seekingalpha.com': 'Seeking Alpha',
  'coindesk.com': 'CoinDesk',
  'theblock.co': 'The Block',
  'federalreserve.gov': 'Federal Reserve',
  'ecb.europa.eu': 'European Central Bank',
  'imf.org': 'IMF',
  'worldbank.org': 'World Bank',
  'sec.gov': 'SEC',
  'bls.gov': 'Bureau of Labor Statistics',
};

export function prettyOutletName(domain: string | null | undefined): string {
  if (!domain) return 'Unknown source';
  const d = domain.toLowerCase().replace(/^www\./, '');
  if (OUTLET_NAMES[d]) return OUTLET_NAMES[d]!;
  // Fallback: try stripping common subdomain prefixes.
  const stripped = d.replace(/^(m|mobile|www|edition|media|news|amp|cdn)\./, '');
  if (OUTLET_NAMES[stripped]) return OUTLET_NAMES[stripped]!;
  // Final fallback: take the eTLD+1 base and capitalize.
  const parts = stripped.split('.');
  if (parts.length >= 2) {
    const base = parts[parts.length - 2]!;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return d;
}
