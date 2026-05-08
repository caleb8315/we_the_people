import type { EvidenceItem, VerificationStatus } from './types';
import type { DetectedContradiction } from './contradictions';
import type { PhysicalEvidence } from './evidence';
import {
  reliabilityPublicLabel,
  reliabilityPublicLabelDisplay,
  type ReliabilityPublicLabel,
} from './scoring';

/**
 * Unified Confidence Contract (Phase 0 — in-place rebuild).
 *
 * Purpose: all user-facing surfaces (feed card, signal page, verify page,
 * share links, API, email briefings) MUST derive what to show from this
 * single contract. Before this module, each surface reconstructed trust UX
 * from ad-hoc combinations of `verification_status`, `reliability_label`,
 * `reliability_summary`, `physical_evidence`, and `contradictions` — which
 * led to subtly inconsistent language, badges, and numbers across pages.
 *
 * This contract is deterministic, LLM-free, and pure. It does NOT replace
 * the underlying columns; it composes them into one stable shape.
 *
 * Design rules:
 *   - Express conclusions in proportion to evidence strength.
 *   - Confidence is expressed as one of four bands, not a bare number. The
 *     numeric reliability_score is still available for advanced surfaces
 *     but is never the primary UX unit.
 *   - "contested" overrides any higher band when sources materially disagree.
 *   - Exactly 1–3 explanation bullets, each one plain English under 140 chars.
 *   - Source trace is a structured, ranked list — NOT the raw evidence dump.
 */

export type ConfidenceBand = 'high' | 'medium' | 'low' | 'contested';

export interface SourceTraceEntry {
  domain: string;
  url: string;
  title: string | null;
  published_at: string | null;
  is_credible: boolean;
  /**
   * Role this source plays in the confidence picture:
   *   - 'primary'      — first-seen / headline reporter
   *   - 'corroborating'— independent credible outlet agreeing on the shape
   *   - 'conflicting'  — source involved in a detected contradiction
   *   - 'sensor'       — open sensor network (USGS, NASA EONET, NOAA, etc.)
   */
  role: 'primary' | 'corroborating' | 'conflicting' | 'sensor';
}

export interface ConfidenceReport {
  band: ConfidenceBand;
  /** Short machine label (for badges, API clients). */
  label_short: string;
  /** Human display label (for UI). */
  label_display: string;
  /** One-sentence summary of the current confidence posture. */
  summary: string;
  /**
   * 1–3 plain-language bullets explaining WHY the band landed where it did.
   * Each bullet is self-contained and safe to render standalone.
   */
  explanation_bullets: string[];
  /**
   * Top 5 sources ranked by role + credibility. Never the full evidence
   * list — use `evidence` rows for the long form.
   */
  source_trace: SourceTraceEntry[];
  /**
   * Numeric composite (0–100) carried through for advanced / ops surfaces.
   * UIs that render this must always pair it with `band` for context.
   */
  reliability_score: number | null;
}

export interface ConfidenceInputs {
  verification_status: VerificationStatus;
  reliability_score: number | null;
  reliability_label: ReliabilityPublicLabel | null;
  evidence: EvidenceItem[];
  contradictions: DetectedContradiction[];
  physical_evidence: PhysicalEvidence | null;
  source_count: number;
  credible_source_count: number;
  complex_signal?: boolean;
  /**
   * Optional provenance warnings to merge into explanation bullets. Phase 2
   * and Phase 3 use this for social + image/link provenance. Each string
   * MUST already be user-safe (<= 140 chars, plain language).
   */
  provenance_warnings?: string[];
  /**
   * When true, the engine caps the band at `medium` regardless of the score
   * / label. Used for social submissions that lack independent corroboration.
   */
  cap_band_at_medium?: boolean;
}

const MAX_BULLETS = 3;
const MAX_TRACE = 5;

const BAND_LABEL_SHORT: Record<ConfidenceBand, string> = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  contested: 'CONTESTED',
};

const BAND_LABEL_DISPLAY: Record<ConfidenceBand, string> = {
  high: 'High confidence',
  medium: 'Mixed evidence',
  low: 'Limited evidence',
  contested: 'Sources disagree',
};

/**
 * Map an existing reliability label + contradiction count to a confidence
 * band. The priority order is intentional and non-negotiable:
 *   1. Any detected contradictions → `contested` (regardless of score).
 *   2. reliability_label drives high/medium/low.
 *   3. Fallback to numeric score thresholds when the label is absent.
 */
export function bandFromReliability(
  label: ReliabilityPublicLabel | null,
  score: number | null,
  contradictionsCount: number,
): ConfidenceBand {
  if (contradictionsCount > 0) return 'contested';
  if (label === 'LIKELY_ACCURATE') return 'high';
  if (label === 'UNCLEAR') return 'medium';
  if (label === 'LIKELY_UNRELIABLE') return 'low';
  if (typeof score === 'number') {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }
  return 'low';
}

function bandSummary(
  band: ConfidenceBand,
  input: ConfidenceInputs,
): string {
  const credible = input.credible_source_count ?? 0;
  const total = input.source_count ?? 0;
  const others = Math.max(0, total - credible);
  switch (band) {
    case 'contested':
      return 'Different outlets are reporting different things about important parts of this story.';
    case 'high':
      if (credible >= 4) {
        return `${credible} independent rated outlets are all reporting this.`;
      }
      return 'Multiple independent rated outlets are reporting the same thing.';
    case 'medium':
      if (credible >= 2) {
        return others > 0
          ? `${total} sources are reporting this (${credible} rated outlets) — story is still developing.`
          : `${credible} rated outlets are reporting this — the story is still developing.`;
      }
      if (credible === 1) {
        return others > 0
          ? `${total} sources are reporting this — one rated outlet and ${others} unrated source${others === 1 ? '' : 's'}. Judge each on its own merits.`
          : 'One rated outlet is reporting this — watching for independent confirmation.';
      }
      // credible === 0 but volume floor fired (5+ sources agree across tiers).
      return `${total} independent sources are reporting this. None are rated yet, so read them and judge each on its merits.`;
    case 'low':
      if (total === 0) {
        return 'We haven\u2019t been able to find any reporting on this yet.';
      }
      // Neutral framing: tell the reader what we found, not a verdict on the
      // sources themselves. Curated credibility lists miss independent
      // reporting all the time — saying "not major newsrooms" is itself
      // a bias, not a neutral signal.
      return total === 1
        ? 'We\u2019ve only found one source for this so far. Look at it yourself and watch for others.'
        : `${total} sources are reporting this, but none are rated yet. Read them and judge for yourself.`;
  }
}

function hasSensorMatch(pe: PhysicalEvidence | null): boolean {
  if (!pe) return false;
  return pe.status === 'confirmed' || pe.status === 'partial';
}

function buildBullets(band: ConfidenceBand, input: ConfidenceInputs): string[] {
  const bullets: string[] = [];
  const { source_count, credible_source_count, contradictions, physical_evidence } = input;

  // Always lead with corroboration shape when we have something to say.
  //
  // Important: don't disparage non-credible sources. "Credible" here just
  // means "on our rated-outlet list". Plenty of independent /
  // regional / specialist outlets aren't on that list but still produce
  // real reporting. Describe what we see; don't editorialise.
  if (source_count > 0) {
    const others = Math.max(0, source_count - credible_source_count);
    if (credible_source_count >= 2) {
      bullets.push(
        others > 0
          ? `${source_count} sources are reporting this — ${credible_source_count} rated outlets plus ${others} unrated source${others === 1 ? '' : 's'}.`
          : `${credible_source_count} rated outlets are reporting the same event.`,
      );
    } else if (credible_source_count === 1) {
      bullets.push(
        others > 0
          ? `${source_count} sources are reporting this. One is a rated outlet; the other ${others === 1 ? 'source is' : `${others} are`} unrated — judge each on its own merits.`
          : 'One rated outlet is reporting this — still watching for independent confirmation.',
      );
    } else if (source_count >= 5) {
      bullets.push(
        `${source_count} independent sources are reporting this. None are rated yet — read them yourself before trusting specifics.`,
      );
    } else if (source_count >= 2) {
      bullets.push(
        `${source_count} sources are reporting this. None have been rated yet.`,
      );
    } else {
      bullets.push('Only one source is reporting this so far.');
    }
  }

  if (contradictions.length > 0) {
    const types = new Set(contradictions.map((c) => c.type));
    const kinds = [...types].map(shortConflictKind).join(', ');
    bullets.push(`Reports disagree on ${kinds}.`);
  }

  if (physical_evidence) {
    if (physical_evidence.status === 'confirmed') {
      const nets = physical_evidence.sources
        .filter((s) => !/credible outlet/i.test(s))
        .slice(0, 2)
        .join(', ') || 'open sensor data';
      bullets.push(
        `Sensor networks (${nets}) picked up a real event matching this description.`,
      );
    } else if (physical_evidence.status === 'partial') {
      bullets.push('Sensor networks partially confirm something is happening, but coverage is incomplete.');
    } else if (physical_evidence.status === 'none_detected' && band === 'low') {
      bullets.push('Sensor networks (earthquakes, weather, wildfires) didn\u2019t pick up anything matching.');
    }
  }

  if (input.complex_signal) {
    bullets.push(
      'This story has too many moving parts for us to automatically spot disagreements — review the sources yourself.',
    );
  }

  // Guarantee at least one bullet.
  if (bullets.length === 0) {
    bullets.push(bandSummary(band, input));
  }

  return bullets.slice(0, MAX_BULLETS);
}

function shortConflictKind(t: string): string {
  switch (t) {
    case 'numeric_conflict':
      return 'numbers';
    case 'presence_conflict':
      return 'what is happening';
    case 'cause_conflict':
      return 'cause or attribution';
    default:
      return 'material details';
  }
}

function buildSourceTrace(
  input: ConfidenceInputs,
): SourceTraceEntry[] {
  const { evidence, contradictions, physical_evidence } = input;
  const conflictingUrls = new Set<string>();
  for (const c of contradictions) {
    const m = c.metadata as Record<string, unknown>;
    for (const key of ['a', 'b', 'assertion', 'observation']) {
      const entry = m?.[key];
      if (entry && typeof entry === 'object') {
        const url = (entry as Record<string, unknown>).url;
        if (typeof url === 'string') conflictingUrls.add(url);
      }
    }
  }

  const sensorMatch = hasSensorMatch(physical_evidence);

  const entries: SourceTraceEntry[] = evidence.map((e, i) => {
    let role: SourceTraceEntry['role'];
    if (conflictingUrls.has(e.url)) role = 'conflicting';
    else if (sensorMatch && isSensorDomain(e.domain, e.source_id ?? null)) role = 'sensor';
    else if (i === 0) role = 'primary';
    else role = 'corroborating';
    return {
      domain: e.domain,
      url: e.url,
      title: e.title ?? null,
      published_at: e.published_at ?? null,
      is_credible: Boolean(e.is_credible),
      role,
    };
  });

  // Rank: conflicting first (they need to be visible), then sensor, then
  // credible primary/corroborating, then the rest.
  const rank: Record<SourceTraceEntry['role'], number> = {
    conflicting: 0,
    sensor: 1,
    primary: 2,
    corroborating: 3,
  };
  entries.sort((a, b) => {
    const byRole = rank[a.role] - rank[b.role];
    if (byRole !== 0) return byRole;
    if (a.is_credible !== b.is_credible) return a.is_credible ? -1 : 1;
    return 0;
  });

  return entries.slice(0, MAX_TRACE);
}

const SENSOR_DOMAINS = [
  'usgs.gov',
  'earthquake.usgs.gov',
  'volcanoes.usgs.gov',
  'eonet.gsfc.nasa.gov',
  'eonet.sci.gsfc.nasa.gov',
  'nasa.gov',
  'noaa.gov',
  'weather.gov',
  'swpc.noaa.gov',
];

function isSensorDomain(domain: string, sourceId: string | null): boolean {
  const d = (domain ?? '').toLowerCase().replace(/^www\./, '');
  if (!d) return false;
  if (sourceId === 'usgs' || sourceId === 'usgs-quakes') return true;
  if (sourceId === 'nasa-eonet') return true;
  if (sourceId === 'noaa-alerts' || sourceId === 'swpc-alerts') return true;
  return SENSOR_DOMAINS.some((n) => d === n || d.endsWith('.' + n));
}

/**
 * Build the unified ConfidenceReport for a signal.
 *
 * This is the ONLY function the UI, API, and email surfaces should call
 * to decide how to display trust. Do not invent parallel mappings.
 */
export function buildConfidenceReport(input: ConfidenceInputs): ConfidenceReport {
  let band = bandFromReliability(
    input.reliability_label,
    input.reliability_score,
    input.contradictions.length,
  );
  // Corroboration floor.
  //
  // `bandFromReliability` only reads label + score + contradiction count, so
  // a signal can be corroborated across many sources and still land on `low`
  // if the reliability scorer hasn't labelled it yet. That produced the
  // incoherent "Limited evidence" copy next to cards with 6+ sources.
  //
  // We apply two independent floors:
  //
  //   1. Credible-outlet floor — 2+ credible outlets → at least `medium`,
  //      4+ credible outlets → at least `high`. This is the strongest signal.
  //
  //   2. Volume floor (tier-agnostic) — if many independent sources are all
  //      reporting the same thing with no detected disagreement, that IS
  //      meaningful corroboration even when none of them match our curated
  //      "rated-outlet" list. Dismissing 9 independent sources because
  //      none are on the Tier-1 list is itself a form of editorial bias.
  //      Threshold: 5+ total sources → at least `medium`. We do NOT promote
  //      tier-agnostic volume to `high` — reaching `high` still requires
  //      corroboration by outlets on our credible list, since `high`
  //      represents "we can vouch for the reporters themselves".
  //
  // Contradictions always override to `contested` (source counts don't
  // resolve disagreements). LIKELY_UNRELIABLE is respected only when the
  // floor doesn't kick in — if 4 credible outlets agree, a stale UNRELIABLE
  // label shouldn't silently call the story fake.
  if (input.contradictions.length === 0) {
    const credible = input.credible_source_count ?? 0;
    const total = input.source_count ?? 0;
    if (credible >= 4 && band !== 'high') band = 'high';
    else if (credible >= 2 && band === 'low') band = 'medium';
    else if (total >= 5 && band === 'low') band = 'medium';
  }
  // Phase 2 — social submissions cap the band at `medium` unless
  // independent credible reporting corroborates the claim.
  if (input.cap_band_at_medium && band === 'high') band = 'medium';
  const bullets = buildBullets(band, input);
  // Merge provenance warnings (Phase 2 + 3). We reserve 1 slot at most so the
  // report stays readable; further detail lives on the verify / signal page.
  if (input.provenance_warnings && input.provenance_warnings.length > 0) {
    const room = MAX_BULLETS - bullets.length;
    if (room > 0) bullets.push(...input.provenance_warnings.slice(0, room));
    else bullets[bullets.length - 1] = input.provenance_warnings[0]!;
  }
  return {
    band,
    label_short: BAND_LABEL_SHORT[band],
    label_display: BAND_LABEL_DISPLAY[band],
    summary: bandSummary(band, input),
    explanation_bullets: bullets.slice(0, MAX_BULLETS),
    source_trace: buildSourceTrace(input),
    reliability_score: input.reliability_score ?? null,
  };
}

/**
 * Human display for the 4-band enum. Kept here (not in the UI layer) so
 * every surface — email, API clients, React components — renders the same
 * string and never drifts.
 */
export function confidenceBandDisplay(band: ConfidenceBand): string {
  return BAND_LABEL_DISPLAY[band];
}

/** Re-export for consumers that want the legacy 3-band label name. */
export { reliabilityPublicLabelDisplay };
