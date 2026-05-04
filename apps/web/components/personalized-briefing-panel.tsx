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
    <section className="rounded-card border border-amber-200/70 bg-gradient-to-br from-amber-50/80 via-paper to-paper shadow-card">
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16v16H4z" />
              <path d="M4 10h16" />
              <path d="M10 4v16" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">
              AI briefing
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink">My personalized briefing</h2>
            <p className="mt-1 text-sm text-ink-500">
              Structured into supported, disputed, changed, and watch sections based on your settings.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(245,158,11,0.55)] transition hover:bg-amber-600 disabled:opacity-60"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                Generating…
              </>
            ) : (
              'Generate my briefing'
            )}
          </button>
          <div className="flex items-center gap-3 text-xs text-ink-400">
            {signalsUsed != null && (
              <span className="flex items-center gap-1">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 6v6c0 4.5 3.3 8.3 8 9 4.7-.7 8-4.5 8-9V6l-8-3z" /></svg>
                {signalsUsed} signals
              </span>
            )}
            {remaining != null && (
              <span className="flex items-center gap-1">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                {remaining} left today
              </span>
            )}
            {remaining == null && signalsUsed == null && (
              <span>Beta limit: 2 calls/day</span>
            )}
          </div>
        </div>
      </div>

      {error && <p className="border-t border-amber-200/50 px-5 py-3 text-sm text-danger-600 sm:px-6">{error}</p>}

      {briefing && sections.length > 0 && (
        <div className="border-t border-amber-200/50 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {collapsedSections.map((section, i) => (
              <div key={i} className={`rounded-lg border p-4 ${sectionToneClass(section.kind)}`}>
                {section.heading && (
                  <p className={`text-[10.5px] font-semibold uppercase tracking-[0.18em] ${sectionLabelTone(section.kind)}`}>
                    {section.heading}
                  </p>
                )}
                <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-700">
                  {section.body}
                </pre>
              </div>
            ))}
          </div>
          {hasExpandableSections && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-paper px-4 py-2 text-xs font-semibold text-ink-600 transition hover:border-ink-300 hover:text-ink"
              >
                {expanded ? 'Show less' : 'Expand full briefing'}
                <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {briefing && sections.length === 0 && (
        <div className="border-t border-amber-200/50 p-5 sm:p-6">
          <pre className="whitespace-pre-wrap rounded-lg border border-ink-100 bg-paper p-4 text-sm leading-relaxed text-ink-700">
            {fallbackPreview}
          </pre>
          {hasExpandableFallback && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-paper px-4 py-2 text-xs font-semibold text-ink-600 transition hover:border-ink-300 hover:text-ink"
              >
                {expanded ? 'Show less' : 'Expand full briefing'}
                <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

type SectionKind =
  | 'summary'
  | 'matters'
  | 'confirmed'
  | 'disputed'
  | 'watch'
  | 'source_note'
  | 'changed'
  | 'happened'
  | 'supported'
  | 'evidence'
  | 'other';

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
  if (/^summary$/.test(h)) return 'summary';
  if (/why it matters/.test(h)) return 'matters';
  if (/^confirmed$/.test(h)) return 'confirmed';
  if (/disputed \/ uncertain|disputed\/uncertain|disputed or uncertain/.test(h)) return 'disputed';
  if (/^source note$/.test(h)) return 'source_note';
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
    case 'summary':
      return 'border-ink-100 bg-paper';
    case 'matters':
      return 'border-amber-200 bg-amber-50/70';
    case 'confirmed':
      return 'border-emerald-200 bg-emerald-50/70';
    case 'supported':
      return 'border-emerald-200 bg-emerald-50/70';
    case 'disputed':
      return 'border-danger-200 bg-danger-50/70';
    case 'watch':
      return 'border-amber-200 bg-amber-50/70';
    case 'source_note':
      return 'border-ink-100 bg-canvas-50';
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
    case 'summary':
      return 'text-ink-600';
    case 'matters':
      return 'text-amber-700';
    case 'confirmed':
      return 'text-emerald-700';
    case 'supported':
      return 'text-emerald-700';
    case 'disputed':
      return 'text-danger-700';
    case 'watch':
      return 'text-amber-700';
    case 'source_note':
      return 'text-ink-500';
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
