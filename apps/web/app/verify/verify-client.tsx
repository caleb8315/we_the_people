'use client';

import { useEffect, useState } from 'react';
import type {
  ConfidenceBand,
  ConfidenceReport,
  LinkProvenance,
  SocialProvenance,
} from '@osint/core';
import type { ReaderReport } from '@/lib/reader-report';
import { Segmented } from '@/components/ui/segmented';
import { VerifyAnalysis, type VerifyAnalysisData } from '@/components/verify-analysis';

type Kind = 'url' | 'text';

interface MatchedSignalLite {
  id: string;
  title: string;
  topic: string | null;
  country_code: string | null;
  source_count: number;
  credible_source_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

interface VerifyResponse {
  report: ConfidenceReport;
  reader_report: ReaderReport;
  /**
   * Evidence-comparison analysis (April 2026 upgrade). Optional on the
   * type so older clients reading older API responses still typecheck.
   */
  analysis?: VerifyAnalysisData;
  input: {
    kind: Kind;
    canonical_url: string | null;
    host: string | null;
    is_social: boolean;
    platform: string | null;
    platform_label: string | null;
    preview_text: string | null;
  };
  social: SocialProvenance | null;
  link: LinkProvenance | null;
  case_id: string | null;
  corroboration: {
    matched_signal: MatchedSignalLite | null;
    matched_by: 'url' | 'keyword' | null;
    total_sources: number;
    credible_sources: number;
    searched_title: string | null;
    systems: Array<{
      id: string;
      name: string;
      status: 'hit' | 'miss' | 'skipped' | 'unavailable' | 'error';
      hits: number;
      note: string;
      evidence_count: number;
    }>;
  };
}

export function VerifyClient({ signedIn }: { signedIn: boolean }) {
  const [kind, setKind] = useState<Kind>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResponse | null>(null);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { kind };
      if (kind === 'url') payload.url = url;
      if (kind === 'text') payload.text = text;
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(verifyErrorMessage(body.error, res.status));
        return;
      }
      const data = (await res.json()) as VerifyResponse;
      setResult(data);
      try {
        await fetch('/api/events', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            event_name: 'verify_result_viewed',
            event_props: {
              band: data.report.band,
              kind: data.input.kind,
              is_social: data.input.is_social,
            },
          }),
        });
      } catch {
        // ignore telemetry failures
      }
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-5 sm:space-y-6">
      <div className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Input kind"
            active={kind}
            onSelect={(v) => setKind(v as Kind)}
            options={[
              { label: 'URL', value: 'url' },
              { label: 'Quoted text', value: 'text' },
            ]}
          />
        </div>

        <div className="mt-4 space-y-4">
          {kind === 'url' && (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                Article or social post
              </span>
              <div className="mt-1.5 flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://x.com/user/status/123"
                  className="min-w-0 flex-1 rounded-full border border-ink-100 bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink-400 shadow-card focus:border-amber-400 focus:outline-none"
                />
                <SubmitButton loading={loading} onClick={submit} />
              </div>
            </label>
          )}
          {kind === 'text' && (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                Quoted claim
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="Paste the claim you want us to cross-check."
                className="mt-1.5 block w-full rounded-3xl border border-ink-100 bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink-400 shadow-card focus:border-amber-400 focus:outline-none"
              />
              <div className="mt-3 flex justify-end">
                <SubmitButton loading={loading} onClick={submit} />
              </div>
            </label>
          )}
          {error && <p className="text-xs text-danger-600">{error}</p>}
        </div>
      </div>

      {!loading && !result && <ExampleVerificationResult />}
      {loading && <VerifyProgress />}
      {result && <VerifyResult data={result} signedIn={signedIn} />}
    </section>
  );
}

function ExampleVerificationResult() {
  return (
    <section className="rounded-card border border-ink-100 bg-canvas-50 p-5 shadow-card sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-400">
        Example result
      </p>
      <h2 className="mt-1 text-lg font-semibold leading-snug text-ink sm:text-xl">
        Cruise ship hantavirus death reports
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        This story is real, but details moved fast and early headlines overstated key facts.
        Multiple outlets confirm a passenger died after a cruise, and health officials did open an
        investigation. What changed is the cause label: some reports called it a confirmed
        hantavirus case before lab confirmation was public.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        Best takeaway: share that there is a confirmed death and investigation, but avoid posting
        definitive cause language until official pathology results are released.
      </p>
    </section>
  );
}

/**
 * Progressive loading card. The verify fan-out can take up to ~30s when
 * GDELT is slow (their free API's p95), and a static spinner for that long
 * feels broken. This component flips the message at 5s / 12s / 22s so the
 * user has context about *why* it's slow and can decide to wait vs. walk
 * away. None of this changes the actual verify latency — it's pure UX.
 */
function VerifyProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const phase = elapsed < 5 ? 0 : elapsed < 12 ? 1 : elapsed < 22 ? 2 : 3;
  const headline = [
    'Checking independent sources\u2026',
    'Still searching the web, social feeds, and sensor networks\u2026',
    'Comparing the strongest matches\u2026',
    'Building your evidence summary\u2026',
  ][phase]!;
  const subline = [
    'Looking for reporting and records that address the same claim.',
    'Checking whether sources agree on the core details.',
    'Ranking direct evidence above repetition and commentary.',
    'Turning the source trail into one clear answer.',
  ][phase]!;

  return (
    <section
      role="status"
      aria-live="polite"
      className="flex items-start gap-4 rounded-card border border-amber-200 bg-amber-50/60 p-5 shadow-card sm:p-6"
    >
      <Spinner />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
          Verifying · {elapsed}s
        </p>
        <p className="mt-1 text-[15px] font-semibold leading-snug text-ink sm:text-base">
          {headline}
        </p>
        <p className="mt-1 text-sm text-ink-600">{subline}</p>
        <ProgressBar elapsed={elapsed} />
      </div>
    </section>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-block h-6 w-6 shrink-0 rounded-full border-[3px] border-amber-200 border-t-amber-500 motion-safe:animate-spin"
    />
  );
}

function ProgressBar({ elapsed }: { elapsed: number }) {
  // Soft ramp against the 30s expected p95. After 30s we show a thin
  // indeterminate sweep instead of pinning at 100%.
  const pct = Math.min(98, (elapsed / 30) * 98);
  const indeterminate = elapsed >= 30;
  return (
    <div className="relative mt-3 h-1 w-full overflow-hidden rounded-full bg-amber-100">
      {!indeterminate ? (
        <div
          className="h-full rounded-full bg-amber-500 transition-all duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      ) : (
        <div className="absolute inset-y-0 w-1/3 rounded-full bg-amber-500 motion-safe:animate-[progressSweep_1.4s_ease-in-out_infinite]" />
      )}
    </div>
  );
}

function SubmitButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_-6px_rgba(245,158,11,0.55)] transition hover:bg-amber-600 disabled:opacity-50"
    >
      {loading ? 'Checking sources…' : 'Verify'}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14" />
        <path d="m13 5 7 7-7 7" />
      </svg>
    </button>
  );
}

function verifyErrorMessage(code: unknown, status: number): string {
  if (status === 429 || code === 'rate_limited') {
    return 'Too many checks in a short period. Please wait a moment and try again.';
  }
  if (status === 400) {
    return 'Check the URL or claim and try again.';
  }
  return 'Something went wrong while starting the check. Please try again.';
}

function VerifyResult({ data, signedIn }: { data: VerifyResponse; signedIn: boolean }) {
  const { reader_report: reader, corroboration, analysis } = data;
  const bandTone = bandToneClasses(reader.band);
  return (
    <section className="space-y-5 rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
      {/* 1. Header — what was submitted, presented conversationally. */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-400">
          {reader.kind_label}
        </p>
        <h2 className="mt-1 text-xl font-semibold leading-snug text-ink sm:text-[24px]">
          {reader.headline}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{reader.one_liner}</p>
      </div>

      {/* 2. THE VERDICT — the main answer: is this trustworthy? */}
      <div className={`rounded-2xl border p-5 sm:p-6 ${bandTone.wrap}`}>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`inline-block h-3 w-3 shrink-0 rounded-full ${bandDotClass(reader.band)}`}
          />
          <p className={`text-sm font-semibold ${bandTone.label}`}>
            {friendlyBandLabel(reader.band)}
          </p>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink sm:text-base">
          {reader.bottom_line}
        </p>
        <p className="mt-2 text-xs text-ink-500">
          Based on {summarizeMixNatural(reader.source_mix)}
        </p>
      </div>

      {/* 2b. Tracked-event match — with event context, not just a data link. */}
      {corroboration.matched_signal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-700">
                We&rsquo;re already tracking this event
              </p>
              <p className="mt-0.5 text-sm text-ink-600">
                &ldquo;{corroboration.matched_signal.title}&rdquo;
                {corroboration.matched_signal.source_count > 0 && (
                  <span className="text-ink-500">
                    {' '}&mdash; {corroboration.matched_signal.source_count} source{corroboration.matched_signal.source_count === 1 ? '' : 's'} on file
                    {corroboration.matched_signal.credible_source_count > 0 && (
                      <>, {corroboration.matched_signal.credible_source_count} rated</>
                    )}
                  </span>
                )}
              </p>
              <a
                href={`/signal/${corroboration.matched_signal.id}`}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-900"
              >
                See full event coverage
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" /><path d="m13 5 7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}

      {reader.what_we_found.length > 0 && (
        <ReaderBlock title="What the evidence says" bullets={reader.what_we_found} />
      )}

      {analysis && <VerifyAnalysis data={analysis} />}

      {signedIn && data.case_id && (
        <a
          href={`/dashboard/ai?case=${encodeURIComponent(data.case_id)}&prompt=${encodeURIComponent(`Walk me through the strongest and weakest evidence for "${reader.headline}".`)}`}
          className="inline-flex rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-700"
        >
          Ask the analyst about this result
        </a>
      )}
      {!signedIn && (
        <div className="rounded-xl border border-ink-100 bg-canvas-50 p-4">
          <p className="text-sm font-medium text-ink-700">Want to keep this check?</p>
          <p className="mt-1 text-sm text-ink-500">
            Sign in to save future verification cases and ask evidence-grounded follow-up questions.
          </p>
          <a href="/login?next=/verify" className="mt-2 inline-block text-sm font-semibold text-signal hover:underline">
            Sign in
          </a>
        </div>
      )}

      {corroboration.systems.some((system) => system.status === 'hit' || system.status === 'miss') && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-ink-100 bg-canvas-50 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-500 hover:bg-canvas-100">
            <span>Where we looked</span>
            <span className="text-ink-400 transition-transform group-open:rotate-180" aria-hidden="true">&#8964;</span>
          </summary>
          <div className="mt-3">
            <CoverageStrip systems={corroboration.systems} />
          </div>
        </details>
      )}
    </section>
  );
}

/** Colours for the hero verdict box — keyed to the confidence band so the
 * visual tone matches the message before the reader even parses the words. */
function bandToneClasses(band: string): { wrap: string; label: string } {
  switch (band) {
    case 'high':
      return { wrap: 'border-emerald-200 bg-emerald-50/80', label: 'text-emerald-700' };
    case 'contested':
      return { wrap: 'border-danger-200 bg-danger-50/80', label: 'text-danger-700' };
    case 'medium':
      return { wrap: 'border-amber-200 bg-amber-50/80', label: 'text-amber-700' };
    case 'low':
    default:
      return { wrap: 'border-ink-200 bg-canvas-50', label: 'text-ink-600' };
  }
}

/**
 * Reader-report content block: a titled list of tone-aware bullets.
 * This is the plain-English replacement for the engine's raw bullet list —
 * each bullet is a plain sentence, color-coded by whether it's a positive
 * finding, neutral info, or a caveat/warning.
 */
function ReaderBlock({
  title,
  bullets,
}: {
  title: string;
  bullets: Array<{ text: string; tone: 'info' | 'good' | 'warn' }>;
}) {
  if (bullets.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-400">
        {title}
      </p>
      <ul className="space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-ink-700">
            <span
              aria-hidden="true"
              className={`mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full ${toneDotClass(b.tone)}`}
            />
            <span>{b.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function toneDotClass(tone: 'info' | 'good' | 'warn'): string {
  switch (tone) {
    case 'good':
      return 'bg-emerald-500';
    case 'warn':
      return 'bg-amber-500';
    case 'info':
    default:
      return 'bg-ink-300';
  }
}

function friendlyBandLabel(band: string): string {
  switch (band) {
    case 'high':
      return 'Looks trustworthy';
    case 'contested':
      return 'Sources clash';
    case 'medium':
      return 'Still forming';
    case 'low':
    default:
      return 'Thin so far';
  }
}

function summarizeMixNatural(mix: {
  total: number;
  rated_outlets: number;
  social_posts: number;
  sensor_events: number;
  reference_hits: number;
}): string {
  if (mix.total === 0) return 'no sources found yet';
  const parts: string[] = [];
  if (mix.rated_outlets > 0) {
    parts.push(
      `${mix.rated_outlets} rated outlet${mix.rated_outlets === 1 ? '' : 's'}`,
    );
  }
  const unrated = Math.max(0, mix.total - mix.rated_outlets - mix.social_posts - mix.sensor_events - mix.reference_hits);
  if (unrated > 0) parts.push(`${unrated} other source${unrated === 1 ? '' : 's'}`);
  if (mix.social_posts > 0) parts.push(`${mix.social_posts} social post${mix.social_posts === 1 ? '' : 's'}`);
  if (mix.sensor_events > 0) parts.push(`${mix.sensor_events} sensor reading${mix.sensor_events === 1 ? '' : 's'}`);
  if (mix.reference_hits > 0) parts.push(`${mix.reference_hits} reference source${mix.reference_hits === 1 ? '' : 's'}`);
  if (parts.length === 0) return `${mix.total} source${mix.total === 1 ? '' : 's'} checked`;
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function CoverageStrip({
  systems,
}: {
  systems: VerifyResponse['corroboration']['systems'];
}) {
  const completed = systems.filter((system) => system.status === 'hit' || system.status === 'miss');
  return (
    <div className="rounded-xl border border-ink-100 bg-canvas-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        Systems we searched
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {completed.map((s) => (
          <li
            key={s.id}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${chipClass(
              s.status,
            )}`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(s.status)}`}
            />
            <span className="font-medium">{s.name}</span>
            {s.status === 'hit' && s.evidence_count > 0 && (
              <span className="text-ink-500">· {s.evidence_count}</span>
            )}
            {s.status === 'miss' && <span className="text-ink-500">· no match</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function chipClass(status: string): string {
  switch (status) {
    case 'hit':
      return 'border-amber-200 bg-amber-50 text-ink';
    case 'miss':
      return 'border-ink-100 bg-paper text-ink-600';
    default:
      return 'border-ink-100 bg-paper text-ink-600';
  }
}

function dotClass(status: string): string {
  switch (status) {
    case 'hit':
      return 'bg-amber-500';
    case 'miss':
      return 'bg-ink-300';
    default:
      return 'bg-ink-300';
  }
}

function bandDotClass(band: ConfidenceBand): string {
  switch (band) {
    case 'high':
      return 'bg-brand-500';
    case 'medium':
      return 'bg-amber-500';
    case 'contested':
      return 'bg-danger-500';
    case 'low':
      return 'bg-ink-300';
  }
}
