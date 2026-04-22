'use client';

import { useEffect, useState } from 'react';
import type {
  ConfidenceBand,
  ConfidenceReport,
  ImageProvenance,
  LinkProvenance,
  SocialProvenance,
} from '@osint/core';
import type { ReaderReport } from '@/lib/reader-report';
import { Segmented } from '@/components/ui/segmented';

type Kind = 'url' | 'text' | 'image';

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
  image: ImageProvenance | null;
  verification_id: string | null;
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

export function VerifyClient() {
  const [kind, setKind] = useState<Kind>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFilename, setImageFilename] = useState('');
  const [imageSha256, setImageSha256] = useState('');
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
      if (kind === 'image') {
        if (imageUrl) payload.image_url = imageUrl;
        if (imageFilename) payload.image_filename = imageFilename;
        if (imageSha256) payload.image_sha256 = imageSha256;
      }
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `http_${res.status}`);
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
    <section className="space-y-6">
      <div className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Input kind"
            active={kind}
            onSelect={(v) => setKind(v as Kind)}
            options={[
              { label: 'URL', value: 'url' },
              { label: 'Quoted text', value: 'text' },
              { label: 'Image', value: 'image' },
            ]}
          />
        </div>

        <div className="mt-5 space-y-4">
          {kind === 'url' && (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                Article, social post, or image URL
              </span>
              <div className="mt-1.5 flex items-center gap-3">
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
          {kind === 'image' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  Image URL
                </span>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://i.imgur.com/..."
                  className="mt-1.5 block w-full rounded-full border border-ink-100 bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink-400 shadow-card focus:border-amber-400 focus:outline-none"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                    Filename (optional)
                  </span>
                  <input
                    type="text"
                    value={imageFilename}
                    onChange={(e) => setImageFilename(e.target.value)}
                    placeholder="screenshot-123.png"
                    className="mt-1.5 block w-full rounded-full border border-ink-100 bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink-400 shadow-card focus:border-amber-400 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                    SHA-256 (optional)
                  </span>
                  <input
                    type="text"
                    value={imageSha256}
                    onChange={(e) => setImageSha256(e.target.value)}
                    placeholder="hex digest"
                    className="mt-1.5 block w-full rounded-full border border-ink-100 bg-paper px-4 py-3 font-mono text-xs text-ink placeholder:text-ink-400 shadow-card focus:border-amber-400 focus:outline-none"
                  />
                </label>
              </div>
              <p className="text-[11px] text-ink-400">
                We do not upload image bytes in v1. Provide a URL and optionally a hash so we can
                deterministically check for duplicates.
              </p>
              <div className="flex justify-end">
                <SubmitButton loading={loading} onClick={submit} />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-danger-600">{error}</p>}
        </div>
      </div>

      {loading && <VerifyProgress />}
      {result && <VerifyResult data={result} />}
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
    'Querying the GDELT global news archive\u2026',
    'Almost there \u2014 GDELT\u2019s free archive can be slow during peak hours.',
  ][phase]!;
  const subline = [
    'Running the fan-out across every configured system in parallel.',
    'Most systems have responded. Waiting on the slower global archives.',
    'This is where deep corroboration comes from \u2014 it can take up to 30 seconds. You can leave this tab open and come back.',
    'If this finishes with \u201CGDELT: didn\u2019t respond\u201D, just retry \u2014 it\u2019s typically faster on the second try.',
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

function VerifyResult({ data }: { data: VerifyResponse }) {
  const { reader_report: reader, corroboration } = data;
  const bandTone = bandToneClasses(reader.band);
  return (
    <section className="space-y-5 rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
      {/* 1. Header — small kind chip + the thing you submitted + plain one-liner. */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-400">
          {reader.kind_label}
        </p>
        <h2 className="mt-1 text-xl font-semibold leading-snug text-ink sm:text-[24px]">
          {reader.headline}
        </h2>
        <p className="mt-1.5 text-sm text-ink-500">{reader.one_liner}</p>
      </div>

      {/* 2. THE VERDICT — big, conversational, at the top. Users came for this.
         Band label sits inside the same box so there's no separate "Mixed
         evidence · N sources" row duplicating information below. */}
      <div className={`rounded-2xl border p-4 sm:p-5 ${bandTone.wrap}`}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${bandDotClass(reader.band)}`}
          />
          <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${bandTone.label}`}>
            {reader.band_label}
          </p>
          <span className="ml-auto text-[11px] text-ink-500">
            {summarizeMix(reader.source_mix)}
          </span>
        </div>
        <p className="mt-2.5 text-[15px] leading-relaxed text-ink sm:text-base">
          {reader.bottom_line}
        </p>
      </div>

      {/* 3. The supporting detail — findings + caveats combined into one
         "Here's why" block. Default open on the result page (users came
         for the answer; detail is secondary but reassuring). */}
      {(reader.what_we_found.length > 0 || reader.what_is_unclear.length > 0) && (
        <details open className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-ink-100 bg-canvas-50 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-500 hover:bg-canvas-100">
            <span>Here&rsquo;s why we&rsquo;re saying that</span>
            <span className="text-ink-400 transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
          </summary>
          <div className="mt-3 space-y-4 px-1">
            {reader.what_we_found.length > 0 && (
              <ReaderBlock title="What the evidence says" bullets={reader.what_we_found} />
            )}
            {reader.what_is_unclear.length > 0 && (
              <ReaderBlock title="What&rsquo;s still unclear" bullets={reader.what_is_unclear} />
            )}
          </div>
        </details>
      )}

      {/* 4. Transparency: which systems we actually hit. Collapsed by default
         — this is reassurance, not primary content. */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-ink-100 bg-canvas-50 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-500 hover:bg-canvas-100">
          <span>Where we looked</span>
          <span className="text-ink-400 transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
        </summary>
        <div className="mt-3">
          <CoverageStrip systems={corroboration.systems} />
        </div>
      </details>

      {/* 5. Friendly source trace. */}
      {reader.source_trace_friendly.length > 0 && (
        <div className="rounded-xl border border-ink-100 bg-canvas-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">
            Sources we used
          </p>
          <ul className="mt-2 space-y-1.5">
            {reader.source_trace_friendly.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider ${roleChipClass(t.role_label)}`}
                >
                  {t.role_label}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-medium text-ink-700 hover:text-amber-600"
                  >
                    {t.outlet_label}
                  </a>
                  <p className="truncate text-xs text-ink-400">
                    {t.domain}
                    {t.is_credible && <span className="ml-1.5 text-amber-600">· trusted list</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.verification_id && (
        <p className="text-[11px] text-ink-400">
          Saved to your history as{' '}
          <span className="font-mono text-ink-600">{data.verification_id}</span>.
        </p>
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

/** Plain-English one-liner for the top-of-result "source mix" chip row. */
function summarizeMix(mix: {
  total: number;
  established_outlets: number;
  social_posts: number;
  sensor_events: number;
  reference_hits: number;
}): string {
  if (mix.total === 0) return 'No sources collected yet';
  const parts: string[] = [];
  if (mix.established_outlets > 0) {
    parts.push(
      `${mix.established_outlets} trusted-list outlet${mix.established_outlets === 1 ? '' : 's'}`,
    );
  }
  const unrated = Math.max(0, mix.total - mix.established_outlets - mix.social_posts - mix.sensor_events - mix.reference_hits);
  if (unrated > 0) parts.push(`${unrated} unrated source${unrated === 1 ? '' : 's'}`);
  if (mix.social_posts > 0) parts.push(`${mix.social_posts} social posts`);
  if (mix.sensor_events > 0) parts.push(`${mix.sensor_events} sensor hits`);
  if (mix.reference_hits > 0) parts.push(`${mix.reference_hits} reference`);
  if (parts.length === 0) return `${mix.total} source${mix.total === 1 ? '' : 's'} total`;
  return parts.join(' · ');
}

function roleChipClass(label: string): string {
  switch (label) {
    case 'Main report':
      return 'bg-amber-100 text-amber-800';
    case 'Backs this up':
      return 'bg-emerald-100 text-emerald-800';
    case 'Disagrees':
      return 'bg-danger-100 text-danger-700';
    case 'Sensor network':
      return 'bg-sky-100 text-sky-800';
    default:
      return 'bg-ink-100 text-ink-600';
  }
}

/**
 * Per-system coverage strip — shows every independent verification system
 * we queried and what each returned. This is the honest answer to "did you
 * actually check the web / social media / sensors?" — the user sees hits,
 * misses, skipped, unavailable, or errored for each system.
 */
function CoverageStrip({
  systems,
}: {
  systems: VerifyResponse['corroboration']['systems'];
}) {
  if (!systems || systems.length === 0) return null;
  // Callouts surface the real reason a system didn't return evidence.
  // We treat `unavailable` and `error` as actionable — either a misconfig
  // (env var missing) or a transient upstream failure. `skipped` is
  // by-design (sensor networks skip non-physical claims, etc.) so we
  // don't auto-expose it; users can still hover the badge for the note.
  const issues = systems.filter(
    (s) => (s.status === 'unavailable' || s.status === 'error') && s.note,
  );
  const skippedSystems = systems.filter((s) => s.status === 'skipped' && s.note);
  return (
    <div className="rounded-xl border border-ink-100 bg-canvas-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        Systems we searched
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {systems.map((s) => (
          <li
            key={s.id}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${chipClass(
              s.status,
            )}`}
            title={s.note}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(s.status)}`}
            />
            <span className="font-medium">{s.name}</span>
            {s.status === 'hit' && s.evidence_count > 0 && (
              <span className="text-ink-500">· {s.evidence_count}</span>
            )}
            {s.status === 'unavailable' && (
              <span className="text-ink-500">· unavailable</span>
            )}
            {s.status === 'miss' && <span className="text-ink-500">· no match</span>}
            {s.status === 'skipped' && <span className="text-ink-500">· skipped</span>}
            {s.status === 'error' && <span className="text-ink-500">· upstream error</span>}
          </li>
        ))}
      </ul>
      {issues.length > 0 && (
        <details className="mt-2 text-[11px] text-ink-600" open>
          <summary className="cursor-pointer select-none font-medium text-ink-700 hover:text-ink-900">
            Why some systems didn&rsquo;t return results ({issues.length})
          </summary>
          <ul className="mt-1.5 space-y-1 border-t border-ink-100 pt-1.5">
            {issues.map((s) => (
              <li key={s.id} className="leading-snug">
                <span className="font-medium text-ink-700">{s.name}:</span>{' '}
                <span className="text-ink-600">{s.note}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {skippedSystems.length > 0 && (
        <details className="mt-1.5 text-[11px] text-ink-500">
          <summary className="cursor-pointer select-none hover:text-ink-700">
            Why {skippedSystems.length} system{skippedSystems.length === 1 ? ' was' : 's were'} skipped
          </summary>
          <ul className="mt-1.5 space-y-1 border-t border-ink-100 pt-1.5">
            {skippedSystems.map((s) => (
              <li key={s.id} className="leading-snug">
                <span className="font-medium text-ink-700">{s.name}:</span>{' '}
                <span className="text-ink-600">{s.note}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function chipClass(status: string): string {
  switch (status) {
    case 'hit':
      return 'border-amber-200 bg-amber-50 text-ink';
    case 'miss':
      return 'border-ink-100 bg-paper text-ink-600';
    case 'skipped':
      return 'border-ink-100 bg-paper text-ink-500';
    case 'unavailable':
      return 'border-ink-100 bg-paper text-ink-500';
    case 'error':
      return 'border-danger-200 bg-danger-50/60 text-danger-700';
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
    case 'skipped':
      return 'bg-ink-200';
    case 'unavailable':
      return 'bg-ink-300';
    case 'error':
      return 'bg-danger-500';
    default:
      return 'bg-ink-300';
  }
}

/**
 * Higher-level banner that pulls one of a few shapes based on the overall
 * corroboration posture: matched a tracked event, found independent
 * coverage, or genuinely didn't find anything.
 */
function CorroborationBanner({
  corroboration,
}: {
  corroboration: VerifyResponse['corroboration'];
}) {
  const { matched_signal, matched_by, total_sources, systems } = corroboration;

  if (matched_signal) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
        <p className="font-semibold uppercase tracking-[0.18em] text-amber-700 text-[11px]">
          Matched to a tracked event
        </p>
        <p className="mt-1 text-sm font-medium leading-snug text-ink">
          {matched_signal.title}
        </p>
        <p className="mt-1 text-ink-600">
          We already cluster this event in our pipeline ({matched_by === 'url' ? 'URL match' : 'headline match'}):
          {' '}{matched_signal.credible_source_count} credible of {matched_signal.source_count} sources
          already on file, plus whatever live searches turned up above.
        </p>
        <a
          href={`/signal/${matched_signal.id}`}
          className="mt-2 inline-flex items-center gap-1 text-amber-700 hover:text-amber-900"
        >
          See full event with source trace
          <span aria-hidden="true">→</span>
        </a>
      </div>
    );
  }

  const hitSystems = systems.filter((s) => s.status === 'hit');
  if (hitSystems.length === 0 && total_sources <= 1) {
    return (
      <div className="rounded-xl border border-ink-100 bg-canvas-50 p-3 text-xs text-ink-700">
        <p className="font-semibold uppercase tracking-[0.18em] text-ink-500 text-[11px]">
          No independent corroboration
        </p>
        <p className="mt-1 text-ink-600">
          We queried every system above and none produced a match. Treat the score below as a
          single-source reading and wait for corroboration before trusting the detail.
        </p>
      </div>
    );
  }

  return null;
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
