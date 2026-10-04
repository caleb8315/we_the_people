import type { ConspiracyLevel, Confidence, Verdict } from '@osint/investigator/schema';

export const VERDICT_STYLE: Record<Verdict, { chip: string; panel: string; text: string; dot: string }> = {
  true: { chip: 'bg-brand-50 text-brand-700 border-brand-200', panel: 'border-brand-200 bg-brand-50/70', text: 'text-brand-700', dot: 'bg-brand-500' },
  mostly_true: { chip: 'bg-brand-50 text-brand-700 border-brand-200', panel: 'border-brand-200 bg-brand-50/60', text: 'text-brand-700', dot: 'bg-brand-400' },
  mixed: { chip: 'bg-warn-50 text-warn-600 border-warn-200', panel: 'border-warn-200 bg-warn-50/70', text: 'text-warn-600', dot: 'bg-warn-400' },
  misleading: { chip: 'bg-flare-50 text-flare-700 border-flare-200', panel: 'border-flare-200 bg-flare-50/70', text: 'text-flare-700', dot: 'bg-flare-500' },
  unproven: { chip: 'bg-canvas-100 text-ink-600 border-ink-200', panel: 'border-ink-200 bg-canvas-50', text: 'text-ink-700', dot: 'bg-ink-300' },
  false: { chip: 'bg-danger-50 text-danger-700 border-danger-200', panel: 'border-danger-200 bg-danger-50/70', text: 'text-danger-700', dot: 'bg-danger-500' },
  fabricated: { chip: 'bg-danger-100 text-danger-700 border-danger-300', panel: 'border-danger-300 bg-danger-50', text: 'text-danger-700', dot: 'bg-danger-600' },
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

export const CONSPIRACY_STYLE: Record<ConspiracyLevel, string> = {
  none: 'text-brand-700',
  some_traits: 'text-warn-600',
  strong: 'text-danger-700',
};

export const OWNERSHIP_LABEL: Record<string, string> = {
  state_controlled: 'State-controlled',
  state_aligned: 'State-aligned',
  state_funded: 'Gov-funded',
  public_broadcaster: 'Public broadcaster',
  wire: 'News agency',
  fact_checker: 'Fact-checker',
  government: 'Official',
  independent: 'Independent',
  unknown: '',
};

export const OWNERSHIP_STYLE: Record<string, string> = {
  state_controlled: 'bg-danger-50 text-danger-700 border-danger-200',
  state_aligned: 'bg-flare-50 text-flare-700 border-flare-200',
  state_funded: 'bg-warn-50 text-warn-600 border-warn-200',
  public_broadcaster: 'bg-canvas-100 text-ink-600 border-ink-100',
  wire: 'bg-canvas-100 text-ink-600 border-ink-100',
  fact_checker: 'bg-brand-50 text-brand-700 border-brand-200',
  government: 'bg-canvas-100 text-ink-600 border-ink-100',
  independent: 'bg-canvas-100 text-ink-600 border-ink-100',
};

export function flag(iso2: string | null | undefined): string {
  if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return '';
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const languageNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'language' }) : null;

export function countryName(iso2: string): string {
  try {
    return regionNames?.of(iso2.toUpperCase()) ?? iso2;
  } catch {
    return iso2;
  }
}

export function languageName(iso: string): string {
  try {
    return languageNames?.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function isUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}
