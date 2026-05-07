import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { getServerSupabase } from '@/lib/supabase-server';
import { logProductEvent } from '@/lib/product-events';
import { Badge } from '@/components/ui/badge';

export const revalidate = 120;

export default async function BriefingPage({ params }: { params: { id: string } }) {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  const { data } = await sb.from('briefings').select('*').eq('id', params.id).maybeSingle();
  if (!data) notFound();

  if (auth.user) {
    void logProductEvent(sb, {
      userId: auth.user.id,
      eventName: 'briefing_opened',
      eventProps: { mode: 'global_detail', briefing_id: data.id, kind: data.kind },
    });
  }

  const sections = parseBriefingSections(String(data.body_markdown ?? ''));
  const visibleSections = sections.filter((section) => section.kind !== 'evidence');
  const rawSourceSections = sections.filter((section) => section.kind === 'evidence');

  return (
    <article className="prose-osint space-y-5 sm:space-y-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="neutral" withIcon={false}>
            {data.kind}
          </Badge>
          <span className="text-xs text-ink-500">{new Date(data.period_start).toLocaleString()}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{data.headline}</h1>
        {(data.topics ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(data.topics as string[]).map((t) => (
              <Badge key={t} variant="topic" withIcon={false}>
                {t}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-[11px] uppercase tracking-[0.18em] text-ink-400">
          AI briefing · structured into supported / disputed / changed / watch
        </p>
      </header>

      {visibleSections.length > 0 ? (
        <div className="space-y-3.5 sm:space-y-4">
          {visibleSections.map((section, i) => (
            <section
              key={i}
              className={`rounded-card border p-5 shadow-card ${sectionToneClass(section.kind)}`}
            >
              {section.heading && (
                <header className="mb-2 flex items-center gap-2">
                  <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${sectionDotClass(section.kind)}`} />
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-600">
                    {section.heading}
                  </h2>
                </header>
              )}
              <div className="prose prose-sm max-w-none text-ink-700">
                <ReactMarkdown>{section.body}</ReactMarkdown>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-card border border-ink-100 bg-paper p-5">
          <div className="prose prose-sm max-w-none text-ink-700">
            <ReactMarkdown>{String(data.body_markdown ?? '')}</ReactMarkdown>
          </div>
        </div>
      )}

      {rawSourceSections.length > 0 && (
        <details className="rounded-card border border-ink-100 bg-canvas-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-700">View raw sources</summary>
          <div className="mt-3 space-y-3">
            {rawSourceSections.map((section, i) => (
              <section key={`raw-${i}`} className="rounded-xl border border-ink-100 bg-paper p-3">
                {section.heading && <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">{section.heading}</h3>}
                <div className="prose prose-sm mt-2 max-w-none text-ink-700">
                  <ReactMarkdown>{section.body}</ReactMarkdown>
                </div>
              </section>
            ))}
          </div>
        </details>
      )}

      <p className="text-xs text-ink-400">
        <Link href="/briefings" className="underline hover:text-ink">
          Back to briefings
        </Link>
      </p>
    </article>
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

/**
 * Parse the LLM briefing markdown into structured sections.
 *
 * The worker prompt asks for these exact headings, in order:
 *   1. **Summary**
 *   2. **Why it matters**
 *   3. **Confirmed**
 *   4. **Disputed / uncertain**
 *   5. **Watch next**
 *   6. **Source note**
 *
 * The deterministic evidence list is appended below the LLM output as
 * `### <kind> — key signals`. We split on bold-headings and on `###`
 * headings so each chunk lands in its own card. If the model ignored
 * the structure and returned freeform prose we render the body
 * verbatim instead — never blow up on unexpected output.
 */
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

  // Capture any preamble before the first heading (rare, but keep it).
  const preamble = text.slice(0, matches[0]!.index).trim();
  if (preamble.length > 0) {
    sections.push({ heading: null, body: preamble, kind: 'other' });
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const bodyStart = cur.index + cur.length;
    const bodyEnd = next ? next.index : text.length;
    const body = text.slice(bodyStart, bodyEnd).trim();
    if (body.length === 0 && !cur.heading) continue;
    sections.push({
      heading: cur.heading,
      body,
      kind: classifyHeading(cur.heading),
    });
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
      return 'border-amber-200 bg-amber-50/60';
    case 'confirmed':
      return 'border-emerald-200 bg-emerald-50/60';
    case 'supported':
      return 'border-emerald-200 bg-emerald-50/60';
    case 'disputed':
      return 'border-danger-200 bg-danger-50/60';
    case 'watch':
      return 'border-amber-200 bg-amber-50/60';
    case 'source_note':
      return 'border-ink-100 bg-canvas-50';
    case 'evidence':
      return 'border-ink-100 bg-canvas-50';
    case 'changed':
      return 'border-sky-200 bg-sky-50/60';
    case 'happened':
    case 'other':
    default:
      return 'border-ink-100 bg-paper';
  }
}

function sectionDotClass(kind: SectionKind): string {
  switch (kind) {
    case 'summary':
      return 'bg-ink-500';
    case 'matters':
      return 'bg-amber-500';
    case 'confirmed':
      return 'bg-emerald-500';
    case 'supported':
      return 'bg-emerald-500';
    case 'disputed':
      return 'bg-danger-500';
    case 'watch':
      return 'bg-amber-500';
    case 'source_note':
      return 'bg-ink-400';
    case 'evidence':
      return 'bg-ink-300';
    case 'changed':
      return 'bg-sky-500';
    default:
      return 'bg-amber-500';
  }
}
