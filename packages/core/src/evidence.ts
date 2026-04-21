import type { EvidenceItem } from './types';

/**
 * Structured "physical evidence" assessment for a signal.
 *
 * CRITICAL wording rule (legal + editorial):
 *   - We NEVER output phrases like "did not happen" or "did not occur".
 *   - Absence of sensor data is described as "no evidence detected" — the
 *     status enum value `none_detected` is the machine-readable form of
 *     that phrase. The UI and downstream consumers must respect this rule;
 *     any helper in this module that emits a human sentence uses only
 *     observation-descriptive wording.
 *
 * The `limitations` field is mandatory: every assessment — even a
 * "confirmed" one — carries at least the universal limitation that this
 * platform only surveys public, unclassified data. Honest limitations let
 * readers calibrate the claim without us ever overselling certainty.
 */

export type PhysicalEvidenceStatus = 'confirmed' | 'partial' | 'none_detected';

export interface PhysicalEvidence {
  status: PhysicalEvidenceStatus;
  /** 0–100. Describes how well the sensor/source mix supports the report. */
  confidence: number;
  /** Human-readable source names, e.g. "USGS seismic network", "3 credible outlets". */
  sources: string[];
  /** Coverage gaps and caveats. Always non-empty by design. */
  limitations: string[];
}

export interface PhysicalEvidenceInputs {
  evidence: EvidenceItem[];
  topic?: string | null;
  title?: string | null;
  summary?: string | null;
}

// ── Detectors (private) ────────────────────────────────────────────────────

const USGS_DOMAINS = ['usgs.gov', 'earthquake.usgs.gov', 'volcanoes.usgs.gov'];
const EONET_DOMAINS = ['eonet.gsfc.nasa.gov', 'eonet.sci.gsfc.nasa.gov'];
const NASA_DOMAINS = ['nasa.gov'];
const NOAA_DOMAINS = ['noaa.gov', 'weather.gov'];
const FIRMS_DOMAINS = ['firms.modaps.eosdis.nasa.gov'];

function normalizeDomain(domain: string): string {
  return (domain ?? '').toLowerCase().replace(/^www\./, '');
}

function matchesAny(domain: string, needles: string[]): boolean {
  const d = normalizeDomain(domain);
  if (!d) return false;
  return needles.some((n) => d === n || d.endsWith('.' + n));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build a `PhysicalEvidence` record from a signal's evidence rows.
 *
 * Status logic:
 *   - `confirmed`       — ≥ 2 sensor networks match AND ≥ 2 credible domains, OR
 *                         ≥ 1 sensor network match AND ≥ 2 credible domains.
 *   - `partial`         — exactly one sensor match, or ≥ 2 credible domains
 *                         without sensors.
 *   - `none_detected`   — no sensor matches. Never interpreted as "did not
 *                         happen" — see the wording rule above.
 */
export function assessPhysicalEvidence(input: PhysicalEvidenceInputs): PhysicalEvidence {
  const evidence = input.evidence ?? [];
  const topic = (input.topic ?? '').toLowerCase();
  const combinedText = `${input.title ?? ''} ${input.summary ?? ''}`.toLowerCase();

  let usgsMatch = false;
  let eonetMatch = false;
  let nasaMatch = false;
  let noaaMatch = false;
  let firmsMatch = false;
  const credibleDomains = new Set<string>();

  for (const e of evidence) {
    const d = normalizeDomain(e.domain ?? '');
    if (matchesAny(d, USGS_DOMAINS) || e.source_id === 'usgs') usgsMatch = true;
    if (matchesAny(d, EONET_DOMAINS) || e.source_id === 'nasa-eonet') eonetMatch = true;
    if (matchesAny(d, NASA_DOMAINS)) nasaMatch = true;
    if (matchesAny(d, NOAA_DOMAINS)) noaaMatch = true;
    if (matchesAny(d, FIRMS_DOMAINS) || e.source_id === 'nasa-firms') firmsMatch = true;
    if (e.is_credible && d) credibleDomains.add(d);
  }
  const credibleCount = credibleDomains.size;

  const satelliteMatch = eonetMatch || nasaMatch || firmsMatch;
  const sensorMatches =
    (usgsMatch ? 1 : 0) + (satelliteMatch ? 1 : 0) + (noaaMatch ? 1 : 0) + (firmsMatch ? 1 : 0);
  const hasCredibleBase = credibleCount >= 2;

  const sources: string[] = [];
  if (usgsMatch) sources.push('USGS seismic network');
  if (firmsMatch) sources.push('NASA FIRMS thermal detection');
  if (eonetMatch) sources.push('NASA EONET');
  else if (nasaMatch && !firmsMatch) sources.push('NASA');
  if (noaaMatch) sources.push('NOAA weather service');
  if (credibleCount > 0) {
    sources.push(`${credibleCount} credible outlet${credibleCount === 1 ? '' : 's'}`);
  }

  const limitations: string[] = [];
  // Universal baseline — we do not survey classified or paywalled data.
  limitations.push(
    'Public-source coverage only; classified, private, or paywalled data is not surveyed.',
  );

  if (!usgsMatch && (topic === 'disaster' || topic === 'war')) {
    limitations.push(
      'No seismic confirmation detected; USGS coverage is sparse for sub-magnitude-4 events.',
    );
  }
  if (!satelliteMatch && (topic === 'disaster' || topic === 'war' || topic === 'climate')) {
    limitations.push(
      'No satellite confirmation detected; public satellite revisit cadence can delay confirmation 1–12 hours.',
    );
    if (/\b(cloud(?:y|s| cover)?|storm|overcast|fog|smoke)\b/.test(combinedText)) {
      limitations.push(
        'Cloud / smoke cover may obscure optical satellite detection in this area.',
      );
    }
  }
  if (!noaaMatch && topic === 'climate') {
    limitations.push('No NOAA weather-service confirmation detected in the current window.');
  }
  if (credibleCount === 0) {
    limitations.push(
      'No credible-tier outlets in the evidence set; reporting may be early, syndicated, or single-source.',
    );
  }

  let status: PhysicalEvidenceStatus;
  let confidence: number;
  if (sensorMatches >= 2 && hasCredibleBase) {
    status = 'confirmed';
    confidence = 90;
  } else if (sensorMatches >= 1 && hasCredibleBase) {
    status = 'confirmed';
    confidence = 75;
  } else if (sensorMatches >= 1) {
    status = 'partial';
    confidence = 60;
  } else if (hasCredibleBase) {
    status = 'partial';
    confidence = 45;
  } else if (credibleCount > 0) {
    status = 'none_detected';
    confidence = 25;
  } else {
    status = 'none_detected';
    confidence = 15;
  }

  return { status, confidence, sources, limitations };
}

/**
 * Short human phrase for the UI. Never phrased as a factual denial —
 * `none_detected` becomes "No physical evidence detected from available
 * sensor networks", NOT "this did not happen".
 */
export function physicalEvidencePhrase(pe: PhysicalEvidence): string {
  switch (pe.status) {
    case 'confirmed':
      return 'Physical evidence confirms public reports.';
    case 'partial':
      return 'Physical evidence partially supports public reports.';
    case 'none_detected':
      return 'No physical evidence detected from available sensor networks.';
  }
}
