'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  CONSPIRACY_LABEL,
  VERDICT_DESCRIPTION,
  VERDICT_LABEL,
  type InvestigationReport,
  type PhysicalCheck,
  type ReportSource,
} from '@osint/investigator/schema';
import {
  CONFIDENCE_LABEL,
  CONSPIRACY_STYLE,
  OWNERSHIP_LABEL,
  OWNERSHIP_STYLE,
  VERDICT_STYLE,
  countryName,
  flag,
  formatDate,
  languageName,
} from './format';

type SourceMap = Map<string, ReportSource>;

export function ReportView({ report }: { report: InvestigationReport }) {
  const sources = useMemo(() => new Map(report.sources.map((s) => [s.id, s])), [report.sources]);
  const style = VERDICT_STYLE[report.verdict];

  return (
    <article className="space-y-5 sm:space-y-6">
      <section className={`rounded-card border p-5 shadow-card sm:p-7 ${style.panel}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-500">The claim</p>
        <h2 className="mt-1 font-display text-xl font-semibold leading-snug text-ink sm:text-2xl">{report.headline_claim}</h2>
        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className={`font-display text-4xl font-semibold tracking-tight sm:text-5xl ${style.text}`}>{VERDICT_LABEL[report.verdict]}</p>
          <span className="mb-1.5 rounded-full border border-ink-100 bg-paper px-3 py-1 text-xs font-medium text-ink-600">
            {CONFIDENCE_LABEL[report.confidence]}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-500">{VERDICT_DESCRIPTION[report.verdict]}</p>
        <p className="mt-4 text-base leading-relaxed text-ink-800">
          <Cited text={report.bottom_line} sources={sources} />
        </p>
        <p className="mt-2 text-xs text-ink-500">{report.confidence_reason}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <AnswerTile
          eyebrow="Is it fake?"
          headline={{ yes: 'Yes', no: 'No', partly: 'Partly', unclear: 'Unclear' }[report.is_it_fake.answer]}
          tone={report.is_it_fake.answer === 'yes' ? 'text-danger-700' : report.is_it_fake.answer === 'no' ? 'text-brand-700' : 'text-warn-600'}
          body={report.is_it_fake.explanation}
        />
        <AnswerTile
          eyebrow="Is it a conspiracy theory?"
          headline={CONSPIRACY_LABEL[report.conspiracy.level]}
          tone={CONSPIRACY_STYLE[report.conspiracy.level]}
          body={report.conspiracy.explanation}
          extra={
            <>
              {report.conspiracy.traits.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {report.conspiracy.traits.map((t) => (
                    <li key={t} className="rounded-full border border-warn-200 bg-warn-50 px-2 py-0.5 text-[11px] text-warn-600">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              {report.conspiracy.documented_real_conspiracy && (
                <p className="mt-2 text-xs font-medium text-ink-600">A real, documented conspiracy is involved — that is not the same as a conspiracy theory.</p>
              )}
            </>
          }
        />
        <AnswerTile eyebrow="What's actually true" headline={null} tone="" body={<Cited text={report.what_is_true} sources={sources} />} />
      </section>

      <Section title="Claim by claim" count={report.claims.length}>
        <div className="space-y-4">
          {report.claims.map((c, i) => (
            <div key={i} className="rounded-2xl border border-ink-100 bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[15px] font-semibold leading-snug text-ink">{c.text}</p>
                <VerdictChip verdict={c.verdict} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                <Cited text={c.explanation} sources={sources} />
              </p>
              {c.citations.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {c.citations.map((q, j) => {
                    const s = sources.get(q.source_id);
                    return (
                      <li key={j} className="flex gap-3 rounded-xl bg-canvas-50 p-3">
                        <span
                          className={`mt-0.5 h-fit shrink-0 self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            q.stance === 'supports' ? 'bg-brand-100 text-brand-700' : q.stance === 'refutes' ? 'bg-danger-100 text-danger-700' : 'bg-canvas-200 text-ink-600'
                          }`}
                        >
                          {q.stance === 'supports' ? 'Supports' : q.stance === 'refutes' ? 'Refutes' : 'Context'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm italic leading-relaxed text-ink-700">“{q.quote}”</p>
                          {s && <SourceLine source={s} />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      {report.sides.length > 0 && (
        <Section title="Every side of the story" count={report.sides.length} subtitle="Each perspective stated in its strongest form, then weighed against the evidence.">
          <div className="grid gap-3 md:grid-cols-2">
            {report.sides.map((side, i) => (
              <div key={i} className="flex flex-col rounded-2xl border border-ink-100 bg-paper p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-ink">
                    {side.countries.map(flag).join(' ')} {side.perspective}
                  </p>
                  <StrengthMeter strength={side.evidence_strength} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">{side.position}</p>
                <p className="mt-2 text-xs leading-relaxed text-ink-500">
                  <span className="font-semibold text-ink-600">Framing: </span>
                  {side.framing_notes}
                </p>
                {side.source_ids.length > 0 && (
                  <p className="mt-auto pt-3 text-xs text-ink-400">
                    {side.source_ids.map((id, k) => (
                      <Fragment key={id}>
                        {k > 0 && ', '}
                        <SourceRef id={id} sources={sources} />
                      </Fragment>
                    ))}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {report.physical_checks.length > 0 && (
        <Section title="Physical evidence: sensors & satellites" count={report.physical_checks.length} subtitle="What instruments recorded at the claimed place and time. No detection is not proof that nothing happened.">
          <div className="space-y-4">
            {report.physical_checks.map((p) => (
              <PhysicalCard key={p.id} check={p} />
            ))}
          </div>
        </Section>
      )}

      {(report.origin.description || report.manipulation_techniques.length > 0) && (
        <Section title="Where it came from & how it's framed">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-ink-100 bg-paper p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">Origin</p>
              {report.origin.earliest_date && <p className="mt-1 text-sm font-semibold text-ink">Earliest known: {formatDate(report.origin.earliest_date)}</p>}
              <p className="mt-1 text-sm leading-relaxed text-ink-700">
                <Cited text={report.origin.description} sources={sources} />
              </p>
              {report.origin.earliest_source_id && (
                <p className="mt-2 text-xs text-ink-500">
                  First source: <SourceRef id={report.origin.earliest_source_id} sources={sources} />
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-ink-100 bg-paper p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">Manipulation techniques</p>
              {report.manipulation_techniques.length === 0 ? (
                <p className="mt-1 text-sm text-ink-600">None identified.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {report.manipulation_techniques.map((m, i) => (
                    <li key={i}>
                      <p className="text-sm font-semibold text-flare-700">{m.technique}</p>
                      <p className="text-sm leading-relaxed text-ink-600">{m.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Section>
      )}

      {report.open_questions.length > 0 && (
        <Section title="Still unknown">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
            {report.open_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </Section>
      )}

      <SourcesSection report={report} />
      <CoverageFooter report={report} />
    </article>
  );
}

function Section({ title, count, subtitle, children }: { title: string; count?: number; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-ink-100 bg-canvas-50 p-5 shadow-card sm:p-6">
      <header className="mb-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">
          {title}
          {typeof count === 'number' && <span className="ml-2 text-ink-300">{count}</span>}
        </h3>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function AnswerTile({ eyebrow, headline, tone, body, extra }: { eyebrow: string; headline: string | null; tone: string; body: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-ink-100 bg-paper p-5 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">{eyebrow}</p>
      {headline && <p className={`mt-1 font-display text-2xl font-semibold ${tone}`}>{headline}</p>}
      <div className="mt-2 text-sm leading-relaxed text-ink-700">{body}</div>
      {extra}
    </div>
  );
}

function VerdictChip({ verdict }: { verdict: InvestigationReport['verdict'] }) {
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${VERDICT_STYLE[verdict].chip}`}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function StrengthMeter({ strength }: { strength: 'strong' | 'moderate' | 'weak' | 'none' }) {
  const n = { strong: 3, moderate: 2, weak: 1, none: 0 }[strength];
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400" title={`Evidence: ${strength}`}>
      <span className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-2.5 w-1.5 rounded-sm ${i <= n ? 'bg-signal-500' : 'bg-ink-100'}`} />
        ))}
      </span>
      {strength === 'none' ? 'No evidence' : `${strength} evidence`}
    </span>
  );
}

function Cited({ text, sources }: { text: string; sources: SourceMap }) {
  const parts = text.split(/(\[S\d+(?:\s*,\s*S\d+)*\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(S\d+(?:\s*,\s*S\d+)*)\]$/);
        if (!m) return <Fragment key={i}>{part}</Fragment>;
        const ids = m[1]!.split(/\s*,\s*/);
        return (
          <sup key={i} className="ml-0.5 whitespace-nowrap">
            {ids.map((id, k) => (
              <Fragment key={id}>
                {k > 0 && ' '}
                <a href={`#source-${id}`} title={sources.get(id)?.outlet ?? id} className="font-semibold text-signal-600 hover:underline">
                  {id}
                </a>
              </Fragment>
            ))}
          </sup>
        );
      })}
    </>
  );
}

function SourceRef({ id, sources }: { id: string; sources: SourceMap }) {
  const s = sources.get(id);
  return (
    <a href={`#source-${id}`} className="font-medium text-signal-600 hover:underline">
      {s ? `${s.outlet}` : id}
    </a>
  );
}

function OwnershipBadge({ ownership, note }: { ownership: string; note: string | null }) {
  const label = OWNERSHIP_LABEL[ownership];
  if (!label) return null;
  return (
    <span title={note ?? undefined} className={`rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${OWNERSHIP_STYLE[ownership] ?? ''}`}>
      {label}
    </span>
  );
}

function SourceLine({ source }: { source: ReportSource }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink-700 hover:underline">
        {flag(source.country)} {source.outlet}
      </a>
      <OwnershipBadge ownership={source.ownership} note={source.ownership_note} />
      {source.published_at && <span>{formatDate(source.published_at)}</span>}
      <a href={`#source-${source.id}`} className="text-ink-400 hover:underline">
        {source.id}
      </a>
    </p>
  );
}

function PhysicalCard({ check }: { check: PhysicalCheck }) {
  const resultStyle: Record<PhysicalCheck['result'], string> = {
    consistent: 'bg-brand-100 text-brand-700',
    inconsistent: 'bg-danger-100 text-danger-700',
    inconclusive: 'bg-warn-100 text-warn-600',
    no_data: 'bg-canvas-200 text-ink-600',
  };
  const resultLabel: Record<PhysicalCheck['result'], string> = {
    consistent: 'Consistent with claim',
    inconsistent: 'Contradicts claim',
    inconclusive: 'Inconclusive',
    no_data: 'Nothing recorded',
  };
  const kindLabel: Record<PhysicalCheck['kind'], string> = {
    earthquake: 'Seismic record',
    natural_event: 'Hazard catalogs',
    fire_detection: 'Satellite fire detection',
    weather_history: 'Recorded weather',
    satellite_imagery: 'Satellite imagery',
    night_lights: 'Night-time lights',
  };
  return (
    <div id={`check-${check.id}`} className="rounded-2xl border border-ink-100 bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {kindLabel[check.kind]}
          {check.place && <span className="font-normal text-ink-500"> · {check.place}</span>}
          {check.window && (
            <span className="font-normal text-ink-400">
              {' '}
              · {check.window.start === check.window.end ? check.window.start : `${check.window.start} → ${check.window.end}`}
            </span>
          )}
        </p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${resultStyle[check.result]}`}>{resultLabel[check.result]}</span>
      </div>
      {check.imagery.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {check.imagery.map((img) => (
            <figure key={img.url} className="overflow-hidden rounded-xl border border-ink-100 bg-ink-900">
              <a href={img.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={`${img.label} — ${img.source}`} loading="lazy" className="aspect-square w-full object-cover" />
              </a>
              <figcaption className="flex items-center justify-between gap-2 bg-paper px-3 py-1.5 text-[11px] text-ink-500">
                <span className="font-semibold text-ink-700">
                  {img.label} {img.date && `· ${img.date}`}
                </span>
                <span className="truncate">{img.source}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className="mt-3 text-sm text-ink-700">{check.observation}</p>
      {check.interpretation && <p className="mt-1 text-sm leading-relaxed text-ink-600">{check.interpretation}</p>}
      <p className="mt-2 text-[11px] text-ink-400">Data: {check.data_sources.join(' · ')}</p>
    </div>
  );
}

function SourcesSection({ report }: { report: InvestigationReport }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? report.sources : report.sources.slice(0, 15);
  return (
    <Section title="Sources" count={report.sources.length} subtitle="Everything the investigation found, cited sources first. Ownership labels show who controls each outlet.">
      <ol className="space-y-2">
        {list.map((s) => (
          <li key={s.id} id={`source-${s.id}`} className="scroll-mt-24 rounded-xl border border-ink-100 bg-paper px-3 py-2.5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-8 shrink-0 text-xs font-semibold text-ink-400">{s.id}</span>
              <div className="min-w-0 flex-1">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium text-ink hover:underline">
                  {s.title ?? s.url}
                </a>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                  <span className="font-semibold text-ink-600">
                    {flag(s.country)} {s.outlet}
                  </span>
                  <OwnershipBadge ownership={s.ownership} note={s.ownership_note} />
                  {s.language && <span>{languageName(s.language)}</span>}
                  {s.published_at && <span>{formatDate(s.published_at)}</span>}
                  <span className="text-ink-400">via {s.retrieved_via}</span>
                  {s.read_full_text && <span className="rounded-full bg-signal-50 px-1.5 py-px text-[10px] font-semibold text-signal-700">Read in full</span>}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {report.sources.length > 15 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm font-semibold text-signal-600 hover:underline">
          {showAll ? 'Show fewer' : `Show all ${report.sources.length} sources`}
        </button>
      )}
    </Section>
  );
}

function CoverageFooter({ report }: { report: InvestigationReport }) {
  const { coverage, integrity } = report;
  return (
    <section className="rounded-card border border-ink-100 bg-paper p-5 text-sm shadow-card sm:p-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">How this was checked</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sources found" value={coverage.sources_found} />
        <Stat label="Read in full" value={coverage.sources_read} />
        <Stat label="Independent outlets cited" value={coverage.independent_outlets} />
        <Stat label="Quotes verified" value={`${integrity.citations_verified}/${integrity.citations_checked}`} />
      </dl>
      {coverage.languages.length > 0 && (
        <p className="mt-4 text-ink-600">
          <span className="font-semibold text-ink-700">Languages searched: </span>
          {coverage.languages.map(languageName).join(', ')}
        </p>
      )}
      {coverage.countries.length > 0 && (
        <p className="mt-1 text-ink-600">
          <span className="font-semibold text-ink-700">Countries covered: </span>
          {coverage.countries.map((c) => `${flag(c)} ${countryName(c)}`).join(' · ')}
        </p>
      )}
      {coverage.tools.length > 0 && (
        <p className="mt-1 text-ink-600">
          <span className="font-semibold text-ink-700">Tools used: </span>
          {coverage.tools.map((t) => `${t.tool.replace(/_/g, ' ')} ×${t.calls}`).join(' · ')}
        </p>
      )}
      {integrity.guardrails.length > 0 && (
        <div className="mt-3 rounded-xl bg-canvas-50 p-3 text-xs text-ink-600">
          <p className="font-semibold text-ink-700">Safety checks applied</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {integrity.guardrails.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-400">
        Every quote above was checked word-for-word against the source text it cites; quotes that could not be found were removed. Model: {report.model} · {Math.round(report.duration_ms / 1000)}s
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-canvas-50 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="font-display text-xl font-semibold text-ink">{value}</dd>
    </div>
  );
}
