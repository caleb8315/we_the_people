/**
 * Reader Report (Phase 8) — plain-English verification output.
 *
 * The `ConfidenceReport` contract in `@osint/core` is the deterministic
 * engine talking to itself: bands, scores, bullets, source trace. Fine
 * for APIs and internal surfaces, but it produces phrases like
 * "One rated outlet is reporting; awaiting independent corroboration"
 * and source-trace rows like `[primary] media.cnn.com`.
 *
 * A Reader Report is what the engine output *means* to a normal person:
 *
 *     - What is this thing I submitted?
 *     - What does the evidence actually say?
 *     - So what should I do with this?
 *
 * Build rules:
 *   - Deterministic. No LLM, no paraphrase. Every string is a templated
 *     composition of counts + factual labels from the underlying report.
 *   - Never asserts truth. We summarize *corroboration*, not reality.
 *   - Plain language. No "rated-tier", no "byte hash", no "canonical
 *     URL", no "[primary]" tags. If a product manager would ask "wtf does
 *     that mean?", it doesn't belong here.
 */

import type { ConfidenceBand, ConfidenceReport } from '@osint/core';

export interface ReaderBullet {
  text: string;
  tone: 'info' | 'good' | 'warn';
}

export interface SourceMix {
  total: number;
  rated_outlets: number;
  social_posts: number;
  sensor_events: number;
  reference_hits: number;
  other: number;
}

export interface ReaderReport {
  headline: string;
  kind_label: string;
  one_liner: string;

  band: ConfidenceBand;
  band_label: string;
  band_summary: string;

  what_we_found: ReaderBullet[];

  bottom_line: string;

  source_mix: SourceMix;
}

export interface ReaderReportInput {
  confidence: ConfidenceReport;
  input: {
    kind: 'url' | 'text';
    canonical_url: string | null;
    host: string | null;
    headline: string | null;
    preview_text: string | null;
    is_social: boolean;
    social_platform_label: string | null;
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
}

/** Build a Reader Report from the engine's output + live-systems coverage. */
export function buildReaderReport(input: ReaderReportInput): ReaderReport {
  const { confidence, input: ctx, corroboration } = input;

  const headline = pickHeadline(ctx);
  const subject = storySubject(headline);
  const kind_label = pickKindLabel(ctx);
  const one_liner = pickOneLiner(ctx, corroboration);

  const source_mix = buildSourceMix(confidence, corroboration);
  const what_we_found = buildFindings(confidence, corroboration, source_mix, subject);
  const bottom_line = buildBottomLine(confidence.band, source_mix, corroboration, subject);

  return {
    headline,
    kind_label,
    one_liner,

    band: confidence.band,
    band_label: confidence.label_display,
    band_summary: confidence.summary,

    what_we_found,

    bottom_line,

    source_mix,
  };
}

function storySubject(headline: string): string {
  const h = (headline ?? '').trim().replace(/\s+/g, ' ');
  if (!h) return 'this submission';
  return `"${h.slice(0, 120)}"`;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function pickHeadline(ctx: ReaderReportInput['input']): string {
  if (ctx.headline && ctx.headline.trim().length > 0) return ctx.headline.trim();
  if (ctx.kind === 'text' && ctx.preview_text) {
    return ctx.preview_text.slice(0, 140);
  }
  if (ctx.host) return `Submission from ${ctx.host}`;
  return 'Verification result';
}

function pickKindLabel(ctx: ReaderReportInput['input']): string {
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
    rated_outlets: confidence.source_trace.filter((t) => t.is_credible && t.role !== 'sensor').length,
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
  subject: string,
): ReaderBullet[] {
  const out: ReaderBullet[] = [];

  let ratedOutletsStated = false;
  if (corroboration.matched_signal) {
    const ms = corroboration.matched_signal;
    const others = Math.max(0, ms.source_count - ms.credible_source_count);
    let body: string;
    if (ms.credible_source_count >= 2) {
      body = others > 0
        ? `${subject} is independently covered by ${ms.credible_source_count} rated outlets, plus ${others} additional source${others === 1 ? '' : 's'}. That level of independent coverage is a strong signal for the core event.`
        : `${subject} is independently covered by ${ms.credible_source_count} rated outlets. When multiple outlets match, the core facts are usually solid.`;
    } else if (ms.credible_source_count === 1) {
      body = others > 0
        ? `One rated outlet is reporting this, along with ${others === 1 ? 'one other source' : `${others} other sources`} we haven\u2019t rated yet. That is a start, but watch for more independent pickup.`
        : 'One rated outlet is reporting this so far. We\u2019re watching for others to independently confirm.';
    } else if (ms.source_count >= 2) {
      body = `${ms.source_count} sources are covering this, though none are rated outlets yet. The coverage exists, but check each source directly.`;
    } else {
      body = `${ms.source_count} source${ms.source_count === 1 ? ' is' : 's are'} covering this event.`;
    }
    out.push({ tone: ms.credible_source_count >= 2 ? 'good' : 'info', text: body });
    ratedOutletsStated = true;
  }

  if (!ratedOutletsStated) {
    const others = Math.max(0, mix.total - mix.rated_outlets);
    if (mix.rated_outlets >= 2) {
      out.push({
        tone: 'good',
        text: others > 0
          ? `${mix.rated_outlets} rated outlets are reporting this independently, plus ${others} other source${others === 1 ? '' : 's'}. Multiple independent outlets covering the same event is a strong trust signal.`
          : `${mix.rated_outlets} rated outlets are independently reporting the same event. That kind of agreement across outlets makes the core facts much more trustworthy.`,
      });
    } else if (mix.rated_outlets === 1) {
      out.push({
        tone: 'info',
        text: others > 0
          ? `One rated outlet is reporting this, plus ${others} unrated source${others === 1 ? '' : 's'}. Not enough for full confidence yet — check each source yourself.`
          : 'One rated outlet has this so far. Promising, but we’re waiting to see if others independently confirm.',
      });
    } else if (mix.total >= 5) {
      out.push({
        tone: 'info',
        text: `${mix.total} sources are covering this, but none are rated outlets yet. That doesn’t automatically mean they’re wrong — many real stories break outside major outlets — but read each source carefully.`,
      });
    } else if (mix.total >= 2) {
      out.push({
        tone: 'info',
        text: `${mix.total} sources mention this. We haven’t rated any of them yet, so judge each on its own merits before drawing conclusions.`,
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

  const marketSignals = systemsById.get('polymarket')?.evidence_count ?? 0;
  if (mix.social_posts > 0) {
    const plural = mix.social_posts === 1 ? 'post' : 'posts';
    out.push({
      tone: 'info',
      text: `There’s public discussion happening — ${mix.social_posts} matching ${plural} on Reddit or Bluesky. Social chatter shows awareness but isn’t evidence on its own.`,
    });
  }

  if (marketSignals > 0) {
    out.push({
      tone: 'info',
      text: `${marketSignals} matching Polymarket signal${marketSignals === 1 ? '' : 's'} found. Prediction markets reflect crowd expectations, not confirmed facts.`,
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
      text: 'No independent coverage matched this submission. The available evidence is too thin to treat it as established yet.',
    });
  }
  return out.slice(0, 5);
}

function buildBottomLine(
  band: ConfidenceBand,
  mix: SourceMix,
  corroboration: ReaderReportInput['corroboration'],
  subject: string,
): string {
  switch (band) {
    case 'high':
      if (mix.sensor_events > 0) {
        return `${subject} is well-supported. Multiple rated outlets report the same event and physical sensor data lines up. You can share the core claim with reasonable confidence.`;
      }
      return `${subject} is well-supported. Multiple rated outlets independently report the same core event, though details may still evolve.`;
    case 'contested':
      return 'Sources are contradicting each other on key details. The event itself may be real, but the specifics are in dispute. We\u2019d recommend waiting before sharing \u2014 the picture should become clearer as reporting settles.';
    case 'medium':
      if (corroboration.matched_signal) {
        return 'The event appears to be real, but the full picture is still coming together. The broad strokes are backed up, though some details aren\u2019t independently confirmed yet. Worth following, but be cautious about specifics.';
      }
      if (mix.rated_outlets === 0 && mix.total >= 5) {
        return `Multiple sources are covering this, but none are rated outlets yet. That doesn’t mean it’s wrong — stories often break outside the mainstream — but read the sources yourself before taking specifics at face value.`;
      }
      if (mix.rated_outlets === 1) {
        return 'One rated outlet has picked this up, along with some other sources. That’s a promising sign, but we’d want to see more independent confirmation before considering the details reliable.';
      }
      return 'This appears to be a developing story. The general shape looks plausible, but no single claim has enough independent backing yet to be confident about. Keep watching for updates.';
    case 'low':
      if (mix.total === 0) {
        return 'No independent reporting matched this submission. The evidence is currently too thin to treat it as established.';
      }
      if (mix.total === 1) {
        return 'Only one source is reporting this so far. That\u2019s not enough to judge reliability. Check who published it, look at their track record, and wait for other outlets to pick it up before trusting the details.';
      }
      return `A few sources mention this, but none are rated outlets yet. Read each one carefully and form your own judgement — don’t treat this as confirmed.`;
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
  'polymarket.com': 'Polymarket',
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
  'propublica.org': 'ProPublica',
  'pbs.org': 'PBS NewsHour',
  'axios.com': 'Axios',
  'who.int': 'WHO',
  'cdc.gov': 'CDC',
  'statnews.com': 'STAT News',
  'carbonbrief.org': 'Carbon Brief',
  'news.google.com': 'Google News',
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
