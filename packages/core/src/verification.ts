import type { EvidenceItem, Signal, VerificationStatus } from './types';
import { extractDomain, isCredibleDomain } from './domains';

/**
 * Reliability / corroboration scoring.
 *
 * We never assert "truth" or "fact". We describe how many independent public
 * sources are reporting a given signal and how credible those sources are.
 * The enum values below are internal identifiers (they map to DB rows and
 * RLS policies) — user-facing copy must always go through `statusLabel()`
 * / `statusDescription()` so the product never publicly claims that anything
 * has been "verified" or "fact-checked".
 */

const CORROBORATED_MIN_SOURCES = 2;
const CORROBORATED_MIN_CREDIBLE = 2;
const DEVELOPING_MIN_SOURCES = 2;
const QUARANTINE_EXPIRY_HOURS = 48;

// ── Public labels ──────────────────────────────────────────────────────────
// These are the ONLY strings users should ever see for a signal's reliability.
// Do not render `verification_status` directly in the UI.

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  verified: 'Corroborated',
  developing: 'Developing',
  unverified: 'Single-source',
  quarantined: 'Flagged',
  blocked: 'Suppressed',
};

export const STATUS_SHORT_LABEL: Record<VerificationStatus, string> = {
  verified: 'corroborated',
  developing: 'developing',
  unverified: 'single-source',
  quarantined: 'flagged',
  blocked: 'suppressed',
};

export const STATUS_DESCRIPTION: Record<VerificationStatus, string> = {
  verified:
    'Two or more credible, independent sources are reporting this event consistently. We still present the underlying sources; we do not assert factual truth.',
  developing:
    'Reported by at least one credible source, but not yet independently corroborated by two or more credible outlets. Treat with caution and read the evidence directly.',
  unverified:
    'Reported by a single source so far. Awaiting corroboration from additional independent outlets.',
  quarantined:
    'Flagged for review (for example, policy or legal language without observed on-the-ground evidence). Held back from alerts until corroboration improves.',
  blocked:
    'Suppressed from the public feed (administrative action). Evidence is retained for audit.',
};

export function statusLabel(s: VerificationStatus): string {
  return STATUS_LABEL[s] ?? STATUS_LABEL.unverified;
}

export function statusShortLabel(s: VerificationStatus): string {
  return STATUS_SHORT_LABEL[s] ?? STATUS_SHORT_LABEL.unverified;
}

export function statusDescription(s: VerificationStatus): string {
  return STATUS_DESCRIPTION[s] ?? STATUS_DESCRIPTION.unverified;
}

const NON_KINETIC_PATTERNS: RegExp[] = [
  /\blgbt/i, /\bcivil\s*rights/i, /\babortion/i, /\bgender/i,
  /\bsame[- ]sex/i, /\bdiscrimination\b/i, /\bequality\b/i,
  /\btransgender/i, /\bpolicy\b/i, /\bcourt\s*rul/i, /\bsupreme\s*court/i,
  /\blawsuit/i, /\bverdict/i, /\blegislat/i, /\bexecutive\s*order/i,
];

const KINETIC_EVIDENCE: RegExp[] = [
  /\bkill(ed|ing|s)\s*\d/i, /\bexplo(sion|ded)/i, /\bbomb(ing|ed)/i,
  /\bshell(ing|ed)/i, /\bmissile/i, /\bairstrike/i, /\bdrone\s*strike/i,
  /\bgunfire/i, /\bartiller/i, /\bcasualt/i, /\bfatalit/i,
  /\bwound(ed|s)/i, /\binvasion/i,
];

export interface VerificationDecision {
  status: VerificationStatus;
  source_count: number;
  credible_source_count: number;
  distinct_domains: string[];
  decision_log: string[];
}

// Alias so call sites can use the neutral name.
export type ReliabilityDecision = VerificationDecision;

export function computeStatus(sourceCount: number, credibleCount: number): VerificationStatus {
  if (
    credibleCount >= CORROBORATED_MIN_CREDIBLE &&
    sourceCount >= CORROBORATED_MIN_SOURCES
  ) {
    return 'verified';
  }
  if (sourceCount >= DEVELOPING_MIN_SOURCES) return 'developing';
  if (credibleCount >= 1) return 'developing';
  return 'quarantined';
}

export function isNonKineticContext(text: string): boolean {
  const hasNonKinetic = NON_KINETIC_PATTERNS.some(p => p.test(text));
  if (!hasNonKinetic) return false;
  const hasKinetic = KINETIC_EVIDENCE.some(p => p.test(text));
  return !hasKinetic;
}

/**
 * Compute a reliability decision (internal name kept as `decideVerification`
 * for backwards compatibility; the exported alias `decideReliability` is the
 * preferred name for new code).
 */
export function decideVerification(
  title: string,
  summary: string | null,
  evidence: EvidenceItem[],
): VerificationDecision {
  const distinctDomains = new Set<string>();
  let credible = 0;
  for (const e of evidence) {
    if (!e.domain) continue;
    distinctDomains.add(e.domain);
    if (isCredibleDomain(e.domain)) credible++;
  }

  const text = `${title}\n${summary ?? ''}`;
  const log: string[] = [];

  let status = computeStatus(distinctDomains.size, credible);
  log.push(`initial=${status} sources=${distinctDomains.size} credible=${credible}`);

  if (isNonKineticContext(text) && status !== 'quarantined') {
    log.push('override: non-kinetic context (policy/legal language without kinetic evidence)');
    status = 'quarantined';
  }

  return {
    status,
    source_count: Math.max(distinctDomains.size, 1),
    credible_source_count: credible,
    distinct_domains: [...distinctDomains],
    decision_log: log,
  };
}

export function computeExpiry(
  severity: number,
  topic: string,
  status: VerificationStatus,
): string {
  let hours: number;
  if (status === 'quarantined' || status === 'blocked') hours = 24;
  else if (status === 'verified') {
    if (severity >= 85) hours = 90 * 24;
    else if (severity >= 70) hours = 60 * 24;
    else if (severity >= 50) hours = 30 * 24;
    else hours = 14 * 24;
  } else if (status === 'developing') {
    if (severity >= 70) hours = 30 * 24;
    else hours = 7 * 24;
  } else {
    if (severity >= 70) hours = 48;
    else if (severity >= 40) hours = 24;
    else hours = 12;
  }
  if (topic === 'disaster') hours = Math.max(hours, 24);
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

export function canAlert(status: VerificationStatus, tier: 'priority' | 'daily'): boolean {
  if (status === 'blocked' || status === 'quarantined') return false;
  if (tier === 'priority') return status === 'verified' || status === 'developing';
  return true;
}

export { QUARANTINE_EXPIRY_HOURS };

// Neutral alias for new call sites.
export { decideVerification as decideReliability };

// Re-export for convenience in callers that only need a single function
export { extractDomain };
