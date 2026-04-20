/**
 * Shared display helpers for contradiction rows.
 *
 * The ingest pipeline writes contradictions with the typed contract
 * (`type`, `severity`, `summary`, `metadata`). The helpers here turn a row
 * into:
 *   - an ultra-short inline label (used in the "Key differences detected"
 *     block on every signal card — must fit on one line);
 *   - a friendly type label (used in the signal detail page header).
 *
 * Keep these functions dependency-free so they can be imported from both
 * server components and the signal card.
 */

export type ContradictionType =
  | 'cause_conflict'
  | 'numeric_conflict'
  | 'presence_conflict';

export interface ContradictionInline {
  type: ContradictionType | string | null;
  severity: 'low' | 'medium' | 'high' | string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function humanizeKind(kind: string): string {
  return kind.replace(/_/g, ' ').trim();
}

function firstString(xs: unknown): string | null {
  if (Array.isArray(xs) && typeof xs[0] === 'string' && xs[0].length > 0) {
    return xs[0];
  }
  return null;
}

/**
 * Build a one-line inline representation of a contradiction, suitable for a
 * bullet in the "Key differences detected" block. Always falls back to the
 * persisted `summary` string if we cannot extract a short shape.
 */
export function formatContradictionInline(c: ContradictionInline): string {
  const m = asRecord(c.metadata);
  const a = asRecord(m?.a);
  const b = asRecord(m?.b);
  const assertion = asRecord(m?.assertion);
  const observation = asRecord(m?.observation);

  switch (c.type) {
    case 'numeric_conflict': {
      const aV = a?.value;
      const bV = b?.value;
      if (aV != null && bV != null) {
        return `Numbers: ${aV} vs ${bV}`;
      }
      break;
    }
    case 'presence_conflict': {
      const aKind = typeof assertion?.kind === 'string' ? humanizeKind(assertion.kind) : null;
      const bKind =
        typeof observation?.kind === 'string' ? humanizeKind(observation.kind) : null;
      if (aKind && bKind) {
        return `State: ${aKind} vs. ${bKind}`;
      }
      break;
    }
    case 'cause_conflict': {
      const aFrame = typeof a?.frame === 'string' ? a.frame : null;
      const bFrame = typeof b?.frame === 'string' ? b.frame : null;
      if (aFrame && bFrame) {
        return `Cause: ${aFrame} vs. ${bFrame}`;
      }
      const aAttr = firstString(a?.attribution);
      const bAttr = firstString(b?.attribution);
      if (aAttr && bAttr) {
        return `Actor: ${aAttr} vs. ${bAttr}`;
      }
      break;
    }
    default:
      break;
  }

  // Fallback: use the persisted summary, trimmed to a sensible length.
  const fallback = (c.summary ?? '').trim();
  if (fallback) return fallback;
  return 'Sources disagree on a material detail.';
}

/** Friendly label for a contradiction type, used in the detail-page header. */
export function formatContradictionType(t: string | null | undefined): string {
  switch (t) {
    case 'numeric_conflict':
      return 'Numeric conflict';
    case 'presence_conflict':
      return 'Presence conflict';
    case 'cause_conflict':
      return 'Cause conflict';
    default:
      return 'Source disagreement';
  }
}
