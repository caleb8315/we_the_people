import type { EvidenceItem, Signal, VerificationStatus } from './types';
import { extractDomain, isCredibleDomain } from './domains';

const VERIFIED_MIN_SOURCES = 2;
const VERIFIED_MIN_CREDIBLE = 2;
const DEVELOPING_MIN_SOURCES = 2;
const QUARANTINE_EXPIRY_HOURS = 48;

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

export function computeStatus(sourceCount: number, credibleCount: number): VerificationStatus {
  if (credibleCount >= VERIFIED_MIN_CREDIBLE && sourceCount >= VERIFIED_MIN_SOURCES) {
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

// Re-export for convenience in callers that only need a single function
export { extractDomain };
