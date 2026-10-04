import type { SourceLedger } from '../ledger';
import type { InvestigationEvent, PhysicalCheck } from '../schema';

export type Env = Record<string, string | undefined>;

export interface ToolContext {
  ledger: SourceLedger;
  physical: PhysicalCheck[];
  emit: (e: InvestigationEvent) => void;
  env: Env;
  signal?: AbortSignal;
  stats: Map<string, { calls: number; results: number }>;
  languages: Set<string>;
  countries: Set<string>;
}

export function recordStat(ctx: ToolContext, tool: string, results: number): void {
  const s = ctx.stats.get(tool) ?? { calls: 0, results: 0 };
  s.calls += 1;
  s.results += results;
  ctx.stats.set(tool, s);
}

export function addPhysicalCheck(ctx: ToolContext, check: Omit<PhysicalCheck, 'id' | 'interpretation'>): PhysicalCheck {
  const full: PhysicalCheck = { ...check, id: `P${ctx.physical.length + 1}`, interpretation: null };
  ctx.physical.push(full);
  ctx.emit({ type: 'physical', check: full });
  return full;
}

/** Compact, model-facing view of a ledger entry. */
export function sourceBrief(e: {
  id: string;
  outlet: string;
  title: string | null;
  published_at: string | null;
  language: string | null;
  country: string | null;
  ownership: string;
  snippet: string | null;
}): Record<string, unknown> {
  return {
    id: e.id,
    outlet: e.outlet,
    title: e.title,
    date: e.published_at,
    lang: e.language,
    country: e.country,
    ownership: e.ownership === 'unknown' ? undefined : e.ownership,
    snippet: e.snippet ? e.snippet.slice(0, 280) : undefined,
  };
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateLoose(s: string | null | undefined): Date | null {
  if (!s) return null;
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/);
  if (compact) {
    const [, y, mo, d, h = '00', mi = '00', se = '00'] = compact;
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}Z`);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();
const languageNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' });
  } catch {
    return null;
  }
})();

export function countryName(iso2: string): string {
  try {
    return regionNames?.of(iso2.toUpperCase()) ?? iso2;
  } catch {
    return iso2;
  }
}

export function languageName(iso: string): string {
  try {
    return languageNames?.of(iso.toLowerCase()) ?? iso;
  } catch {
    return iso;
  }
}
