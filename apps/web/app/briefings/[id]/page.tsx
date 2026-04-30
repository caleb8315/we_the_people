import Link from 'next/link';
import { notFound } from 'next/navigation';
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

      {sections.length > 0 ? (
        <div className="space-y-3.5 sm:space-y-4">
          {sections.map((section, i) => (
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
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-700">
                {section.body}
              </pre>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-card border border-ink-100 bg-paper p-5">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-700">
            {data.body_markdown}
          </pre>
        </div>
      )}

      <p className="text-xs text-ink-400">
        <Link href="/briefings" className="underline hover:text-ink">
          Back to briefings
        </Link>
      </p>
    </article>
  );
}

type SectionKind = 'happened' | 'supported' | 'disputed' | 'changed' | 'watch' | 'evidence' | 'other';

interface BriefingSection {
  heading: string | null;
  body: string;
  kind: SectionKind;
}

/**
 * Parse the LLM briefing markdown into structured sections.
 *
 * The worker prompt asks for these exact bold headings, in order:
 *   1. **What happened**
 *   2. **What is widely supported**
 *   3. **What is disputed or unclear**
 *   4. **What changed in the last <window>**
 *   5. **What to watch next**
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
      return 'border-emerald-200 bg-emerald-50/60';
    case 'disputed':
      return 'border-danger-200 bg-danger-50/60';
    case 'watch':
      return 'border-amber-200 bg-amber-50/60';
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
    case 'supported':
      return 'bg-emerald-500';
    case 'disputed':
      return 'bg-danger-500';
    case 'watch':
      return 'bg-amber-500';
    case 'evidence':
      return 'bg-ink-300';
    case 'changed':
      return 'bg-sky-500';
    default:
      return 'bg-amber-500';
  }
}
