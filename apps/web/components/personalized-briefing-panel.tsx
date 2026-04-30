'use client';

import { useMemo, useState } from 'react';

export function PersonalizedBriefingPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [signalsUsed, setSignalsUsed] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await fetch('/api/briefings/generate', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(
        body?.message ??
          'Could not generate your personalized briefing right now. Please retry in a moment.',
      );
      return;
    }
    setBriefing(body.briefing ?? null);
    setExpanded(false);
    setSignalsUsed(typeof body.signals_used === 'number' ? body.signals_used : null);
    setRemaining(typeof body.remaining_estimate === 'number' ? body.remaining_estimate : null);
  }

  const sections = useMemo(() => parseBriefingSections(briefing ?? ''), [briefing]);
  const collapsedSections = useMemo(() => {
    if (expanded) return sections;
    return sections
      .slice(0, 2)
      .map((section) => ({
        ...section,
        body: truncateForPreview(section.body, 340),
      }));
  }, [expanded, sections]);
  const hasExpandableSections = useMemo(
    () =>
      sections.length > 2 ||
      sections.some((section) => section.body.trim().length > 340),
    [sections],
  );
  const fallbackPreview = useMemo(() => {
    const raw = (briefing ?? '').trim();
    if (expanded) return raw;
    return truncateForPreview(raw, 720);
  }, [briefing, expanded]);
  const hasExpandableFallback = useMemo(
    () => ((briefing ?? '').trim().length > 720),
    [briefing],
  );

  return (
    <section className="rounded-card border border-brand-200 bg-brand-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">
            AI briefing · structured into supported / disputed / changed / watch
          </p>
          <h2 className="mt-1 text-base font-semibold">My AI briefing</h2>
          <p className="mt-1 text-xs text-ink-500">
            Personalized to your topic, country, and source settings. Beta limit: 2 AI briefing calls/day.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(245,158,11,0.55)] hover:bg-amber-600 disabled:opacity-60"
        >
          {loading ? 'Generating…' : 'Generate my briefing'}
        </button>
      </div>

      <div className="mt-2 text-xs text-ink-500">
        {signalsUsed != null && <span>Using {signalsUsed} personalized signals. </span>}
        {remaining != null && <span>Remaining today: {remaining}.</span>}
      </div>
      {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}

      {briefing && sections.length > 0 && (
        <div className="mt-3 space-y-2.5">
          {collapsedSections.map((section, i) => (
            <div key={i} className={`rounded-md border px-3 py-2.5 ${sectionToneClass(section.kind)}`}>
              {section.heading && (
                <p className={`text-[10.5px] font-semibold uppercase tracking-[0.18em] ${sectionLabelTone(section.kind)}`}>
                  {section.heading}
                </p>
              )}
              <pre className="mt-1 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-700">
                {section.body}
              </pre>
            </div>
          ))}
          {hasExpandableSections && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-full border border-ink-200 bg-paper px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:border-ink-300 hover:text-ink"
            >
              {expanded ? 'Show less' : 'Expand briefing'}
            </button>
          )}
        </div>
      )}

      {briefing && sections.length === 0 && (
        <div className="mt-3 space-y-2.5">
          <pre className="whitespace-pre-wrap rounded-md border border-ink-100 bg-paper p-3 text-sm leading-relaxed text-ink-700">
            {fallbackPreview}
          </pre>
          {hasExpandableFallback && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-full border border-ink-200 bg-paper px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:border-ink-300 hover:text-ink"
            >
              {expanded ? 'Show less' : 'Expand briefing'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

type SectionKind = 'happened' | 'supported' | 'disputed' | 'changed' | 'watch' | 'evidence' | 'other';

interface BriefingSection {
  heading: string | null;
  body: string;
  kind: SectionKind;
}

function parseBriefingSections(text: string): BriefingSection[] {
  if (!text.trim()) return [];
  const headingRegex = /^(?:###\s+(.+?)|\*\*([^*]+?)\*\*)\s*$/gm;
  const matches: Array<{ heading: string; index: number; length: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(text)) !== null) {
    const heading = (match[1] ?? match[2] ?? '').trim();
    if (heading.length === 0) continue;
    matches.push({ heading, index: match.index, length: match[0].length });
  }
  if (matches.length === 0) return [];
  const sections: BriefingSection[] = [];
  const preamble = text.slice(0, matches[0]!.index).trim();
  if (preamble.length > 0) sections.push({ heading: null, body: preamble, kind: 'other' });
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const bodyStart = cur.index + cur.length;
    const bodyEnd = next ? next.index : text.length;
    const body = text.slice(bodyStart, bodyEnd).trim();
    if (body.length === 0 && !cur.heading) continue;
    sections.push({ heading: cur.heading, body, kind: classifyHeading(cur.heading) });
  }
  return sections;
}

function classifyHeading(heading: string): SectionKind {
  const h = heading.toLowerCase();
  if (/widely supported|what is supported|what is widely/.test(h)) return 'supported';
  if (/disputed|unclear|conflict|disagree/.test(h)) return 'disputed';
  if (/what changed|changed in the last/.test(h)) return 'changed';
  if (/what to watch|watch next/.test(h)) return 'watch';
  if (/what happened/.test(h)) return 'happened';
  if (/key signals|evidence/.test(h)) return 'evidence';
  return 'other';
}

function sectionToneClass(kind: SectionKind): string {
  switch (kind) {
    case 'supported':
      return 'border-emerald-200 bg-emerald-50/70';
    case 'disputed':
      return 'border-danger-200 bg-danger-50/70';
    case 'watch':
      return 'border-amber-200 bg-amber-50/70';
    case 'changed':
      return 'border-sky-200 bg-sky-50/70';
    case 'evidence':
      return 'border-ink-100 bg-canvas-50';
    case 'happened':
    case 'other':
    default:
      return 'border-ink-100 bg-paper';
  }
}

function sectionLabelTone(kind: SectionKind): string {
  switch (kind) {
    case 'supported':
      return 'text-emerald-700';
    case 'disputed':
      return 'text-danger-700';
    case 'watch':
      return 'text-amber-700';
    case 'changed':
      return 'text-sky-700';
    case 'evidence':
      return 'text-ink-500';
    default:
      return 'text-ink-500';
  }
}

function truncateForPreview(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}
