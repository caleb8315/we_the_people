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
    return `This is part of an event we\u2019re already tracking: \u201C${corroboration.matched_signal.title}.\u201D`;
  }
  if (ctx.kind === 'image') {
    return ctx.host
      ? `You submitted an image URL from ${ctx.host}. Images alone give us very little to verify.`
      : 'You submitted an image. Images alone give us very little to verify — ideally share the post or article around the image too.';
  }
  if (ctx.kind === 'text') {
    return 'You submitted a pasted claim. With no source link, we can only check whether similar wording appears anywhere.';
  }
  if (ctx.is_social) {
    return `You submitted a ${ctx.social_platform_label ?? 'social'} post. Social posts don\u2019t count as reporting on their own.`;
  }
  if (ctx.host) {
    return `You submitted an article from ${prettyOutletName(ctx.host)}. We checked other outlets, social feeds, and sensor networks to see what matches.`;
  }
  return 'We checked a range of independent systems for this submission.';
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

  // Prefer the richest single statement about who's carrying the story. If
  // we have a tracked event with a richer count, use that and skip the
  // per-card outlet bullet below.
  let outletsStated = false;
  if (corroboration.matched_signal) {
    const ms = corroboration.matched_signal;
    const others = Math.max(0, ms.source_count - ms.credible_source_count);
    let body: string;
    if (ms.credible_source_count >= 2) {
      body = others > 0
        ? `${ms.source_count} sources are carrying it — ${ms.credible_source_count} on our trusted-source list plus ${others} we haven\u2019t rated.`
        : `${ms.credible_source_count} outlets on our trusted-source list are carrying it.`;
    } else if (ms.credible_source_count === 1) {
      body = others > 0
        ? `${ms.source_count} sources are carrying it — one on our trusted-source list, ${others === 1 ? 'another' : `${others} others`} unrated.`
        : 'One outlet on our trusted-source list is carrying it.';
    } else if (ms.source_count >= 2) {
      body = `${ms.source_count} sources are carrying it — none rated against our trusted-source list yet.`;
    } else {
      body = `${ms.source_count} source${ms.source_count === 1 ? ' is' : 's are'} carrying it.`;
    }
    out.push({
      tone: 'good',
      text: `We\u2019re already tracking this as part of a bigger story. ${body}`,
    });
    outletsStated = true;
  }

  if (!outletsStated) {
    const others = Math.max(0, mix.total - mix.established_outlets);
    if (mix.established_outlets >= 2) {
      out.push({
        tone: 'good',
        text:
          others > 0
            ? `${mix.total} sources are reporting this — ${mix.established_outlets} are on our trusted-source list, plus ${others} we haven\u2019t rated.`
            : `${mix.established_outlets} outlets on our trusted-source list are reporting the same event.`,
      });
    } else if (mix.established_outlets === 1) {
      out.push({
        tone: 'info',
        text:
          others > 0
            ? `${mix.total} sources are carrying this — one is on our trusted-source list, the others we haven\u2019t rated. Check each yourself.`
            : 'One outlet on our trusted-source list is carrying this — watching for independent confirmation.',
      });
    } else if (mix.total >= 5) {
      out.push({
        tone: 'info',
        text: `${mix.total} independent sources are reporting this. None are on our trusted-source list yet — read them yourself before trusting specifics. Curated lists miss plenty of real reporting.`,
      });
    } else if (mix.total >= 2) {
      out.push({
        tone: 'info',
        text: `${mix.total} sources are reporting this. We haven\u2019t matched them to our trusted-source list yet, so judge each on its own merits.`,
      });
    }
  }

  const systemsById = new Map(corroboration.systems.map((s) => [s.id, s] as const));
  const gdelt = systemsById.get('gdelt');
  if (gdelt && gdelt.status === 'hit') {
    out.push({
      tone: 'good',
      text: `Wider news coverage: ${gdelt.evidence_count} outlets worldwide have covered this in the last few days (GDELT archive).`,
    });
  }

  if (mix.social_posts > 0) {
    const plural = mix.social_posts === 1 ? 'post' : 'posts';
    out.push({
      tone: 'info',
      text: `People are talking about it: ${mix.social_posts} Reddit or Bluesky ${plural} match.`,
    });
  }

  const wiki = systemsById.get('wikipedia');
  if (wiki && wiki.status === 'hit' && wiki.evidence_count > 0) {
    out.push({
      tone: 'info',
      text: 'Wikipedia has background on this topic — helpful for context, not proof.',
    });
  }

  if (mix.sensor_events > 0) {
    const plural = mix.sensor_events === 1 ? 'event' : 'events';
    out.push({
      tone: 'good',
      text: `Open sensor networks picked up ${mix.sensor_events} ${plural} that line up with this — that\u2019s physical evidence, not just reporting.`,
    });
  }

  // Contradictions are always worth calling out as a "finding" — it's an
  // important positive signal that we actually detected disagreement.
  const contradictionBullet = confidence.explanation_bullets.find((b) =>
    /disagree/i.test(b),
  );
  if (contradictionBullet) {
    out.push({ tone: 'warn', text: contradictionBullet });
  }

  if (out.length === 0) {
    out.push({
      tone: 'info',
      text: 'Nothing corroborating turned up. Either it\u2019s too new to have spread, it\u2019s very niche, or the claim doesn\u2019t match anything else we can see.',
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
      text: 'You only shared an image. Without the post or article around it, we\u2019re guessing at the context.',
    });
  }
  if (ctx.kind === 'text') {
    out.push({
      tone: 'warn',
      text: 'No link attached, so we\u2019re matching on the wording alone. A URL would let us check the source directly.',
    });
  }
  if (ctx.is_social && !corroboration.matched_signal) {
    out.push({
      tone: 'warn',
      text: 'Social posts alone aren\u2019t reporting. We\u2019ll look for other sources independently covering the same story before calling it confirmed.',
    });
  }

  const web = systemsById.get('web');
  if (web && web.status === 'unavailable') {
    out.push({
      tone: 'info',
      text: 'Broad web search is off right now — we only checked news archives, social, and sensors.',
    });
  }

  const sensors = systemsById.get('sensors');
  if (sensors && sensors.status === 'miss') {
    out.push({
      tone: 'info',
      text: 'No earthquakes, fires, or weather events in open sensor data that match — so whatever this is, it\u2019s not showing up as a physical event.',
    });
  }

  // Fold provenance-layer limits (image/link/social) in as "unclear" bullets.
  // Dedupe against bullets we've already added AND against bullets that say
  // essentially the same thing (the engine often duplicates "no source").
  const saidNoSource = out.some((o) => /no link attached|no source/i.test(o.text));
  for (const l of provenance_limits) {
    if (!l) continue;
    if (out.some((o) => o.text === l)) continue;
    if (saidNoSource && /no source attribution|source attribution|wording alone|claim shape/i.test(l)) continue;
    out.push({ tone: 'warn', text: l });
  }

  // Engine-generated bullets we haven't already rephrased positively.
  // Skip any that we already surfaced as "findings" or that duplicate the
  // "no source / wording alone" message.
  for (const b of confidence.explanation_bullets) {
    // Source-count framing is already covered in `buildFindings`.
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
  // Guiding principle: we describe what we found — we don't pass judgement
  // on whether non-"trusted-list" sources are real reporting. A curated
  // credibility list is useful shorthand, not the only signal that matters.
  switch (band) {
    case 'high':
      if (mix.sensor_events > 0) {
        return 'Multiple trusted-list outlets are reporting this and sensor data backs it up — the basic shape of the story is well-supported.';
      }
      return 'Multiple trusted-list outlets are independently reporting this — the basic shape of the story is well-supported.';
    case 'contested':
      return 'Sources don\u2019t agree on the key details. The underlying event may still be real, but the specifics are contested — hold off on sharing them until it settles.';
    case 'medium':
      if (corroboration.matched_signal) {
        return 'We\u2019re already tracking this event. Broad strokes are corroborated; specific details are still firming up, so be careful with the particulars.';
      }
      if (mix.established_outlets === 0 && mix.total >= 5) {
        return `${mix.total} independent sources are reporting this, but none are on our trusted-source list yet. Read them yourself — real reporting often breaks outside the major outlets.`;
      }
      if (mix.established_outlets === 1) {
        return 'One trusted-list outlet has this plus some unrated sources. Promising, but check the other reporters yourself before trusting specifics.';
      }
      return 'This is developing. The general shape looks real, but no individual claim has enough independent backing yet to be fully confident about.';
    case 'low':
      if (mix.total === 0) {
        return 'We couldn\u2019t find any reporting on this. Could be brand new, could be niche, could be wrong — treat it as unconfirmed until more surfaces.';
      }
      if (mix.total === 1) {
        return 'We\u2019ve only found one source so far. Read it directly, check who wrote it, and watch for others picking it up.';
      }
      return `${mix.total} sources are reporting this, but we haven\u2019t been able to rate any of them against our trusted-source list yet. Read them yourself — don\u2019t take their word as confirmed.`;
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
