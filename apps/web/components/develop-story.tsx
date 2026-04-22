'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RelativeTime } from './relative-time';

/**
 * Signal-detail "Develop this story" affordance.
 *
 * Kicks off the same live corroboration fan-out the /verify flow uses,
 * but scoped to the current signal. While the request is in flight we
 * show progressive messages (identical copy + cadence to VerifyProgress
 * so the UX stays coherent across surfaces). On success we call
 * router.refresh() so the Server Component page re-renders with the new
 * evidence rows and updated source counts — no client-side state
 * reconciliation needed.
 */

export interface DevelopStoryProps {
  signalId: string;
  lastEnrichedAt: string | null;
  /** True when the viewer is signed in. Only signed-in users can force-bypass. */
  canForce: boolean;
}

interface DevelopResponse {
  status: 'enriched' | 'cooldown' | 'not_found' | 'error';
  new_evidence_count: number;
  total_evidence_count: number;
  previous_source_count: number | null;
  updated_source_count: number | null;
  previous_verification_status: string | null;
  updated_verification_status: string | null;
  systems: Array<{
    id: string;
    name: string;
    status: string;
    hits: number;
    note: string;
    evidence_count: number;
  }>;
  last_enriched_at: string | null;
  note: string | null;
}

export function DevelopStoryButton({
  signalId,
  lastEnrichedAt,
  canForce,
}: DevelopStoryProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DevelopResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/signal/${signalId}/develop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: canForce }),
      });
      const json = (await res.json()) as DevelopResponse & { error?: string; note?: string };
      if (!res.ok) {
        // Server mirrors `note` into `error` for failures, but we fall back
        // to `note` (the canonical field on DevelopSignalResult) just in
        // case a proxy rewrites responses.
        setError(json.error ?? json.note ?? `Request failed (${res.status}).`);
      } else {
        setResult(json);
        if (json.status === 'enriched') {
          // Refresh the Server Component so new evidence rows + updated
          // source counts render without a full page reload.
          router.refresh();
        }
      }
    } catch (e) {
      setError((e as Error).message || 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
            Keep developing this story
          </p>
          <p className="mt-1 text-[15px] text-ink-700 sm:text-base">
            Run a fresh sweep across the web, Reddit, Bluesky, Wikipedia, GDELT global news, and open
            sensor networks to pull in whatever&rsquo;s surfaced since this signal was ingested.
          </p>
          <p className="mt-1.5 text-[12px] text-ink-500">
            {lastEnrichedAt ? (
              <>
                Last checked <RelativeTime iso={lastEnrichedAt} />.
              </>
            ) : (
              <>Never enriched live — this will run a fresh multi-system search.</>
            )}
            {' '}Uses the same pipeline as the /verify page.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-6px_rgba(245,158,11,0.55)] transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500 disabled:shadow-none"
        >
          {loading ? <>Searching&hellip;</> : <>Find more sources now</>}
        </button>
      </div>

      {loading && <DevelopProgress />}
      {error && !loading && (
        <p className="mt-3 rounded-xl border border-danger-200 bg-danger-50/60 p-3 text-sm text-danger-700">
          {error}
        </p>
      )}
      {result && !loading && <DevelopResultBanner result={result} />}
    </section>
  );
}

function DevelopProgress() {
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
    'This is where deep corroboration comes from \u2014 it can take up to 30 seconds.',
    'If this finishes with \u201CGDELT: didn\u2019t respond\u201D, just retry \u2014 it\u2019s typically faster on the second try.',
  ][phase]!;

  const pct = Math.min(98, (elapsed / 30) * 98);
  const indeterminate = elapsed >= 30;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-block h-5 w-5 shrink-0 rounded-full border-[3px] border-amber-200 border-t-amber-500 motion-safe:animate-spin"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
          Searching &middot; {elapsed}s
        </p>
        <p className="mt-0.5 text-sm font-semibold text-ink">{headline}</p>
        <p className="mt-0.5 text-[13px] text-ink-600">{subline}</p>
        <div className="relative mt-2 h-1 w-full overflow-hidden rounded-full bg-amber-100">
          {!indeterminate ? (
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="absolute inset-y-0 w-1/3 rounded-full bg-amber-500 motion-safe:animate-[progressSweep_1.4s_ease-in-out_infinite]" />
          )}
        </div>
      </div>
    </div>
  );
}

function DevelopResultBanner({ result }: { result: DevelopResponse }) {
  if (result.status === 'cooldown') {
    return (
      <p className="mt-3 rounded-xl border border-ink-100 bg-canvas-50 p-3 text-sm text-ink-600">
        {result.note ?? 'Already enriched very recently — try again in a few minutes.'}
      </p>
    );
  }
  if (result.status === 'not_found') {
    return (
      <p className="mt-3 rounded-xl border border-danger-200 bg-danger-50/60 p-3 text-sm text-danger-700">
        This signal no longer exists.
      </p>
    );
  }
  if (result.status === 'error') {
    return (
      <p className="mt-3 rounded-xl border border-danger-200 bg-danger-50/60 p-3 text-sm text-danger-700">
        {result.note ?? 'Enrichment failed. Try again in a moment.'}
      </p>
    );
  }

  // Successful enrichment.
  const added = result.new_evidence_count;
  const hitSystems = result.systems.filter((s) => s.status === 'hit');
  const summary =
    added === 0
      ? `No new sources surfaced this time. Searched ${result.systems.length} systems (${hitSystems.length} returned matches); all of it was already on file.`
      : `Added ${added} new source${added === 1 ? '' : 's'} from ${hitSystems.length} system${hitSystems.length === 1 ? '' : 's'}. Story is now being re-scored with the fresh evidence.`;

  return (
    <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 text-sm">
      <p className="font-semibold text-ink">{summary}</p>
      {hitSystems.length > 0 && (
        <p className="mt-1 text-[13px] text-ink-600">
          Matches from: {hitSystems.map((s) => s.name).join(', ')}.
        </p>
      )}
      {result.updated_verification_status &&
        result.previous_verification_status &&
        result.updated_verification_status !== result.previous_verification_status && (
          <p className="mt-1 text-[13px] text-brand-700">
            Reliability updated: <strong>{result.previous_verification_status}</strong> &rarr;{' '}
            <strong>{result.updated_verification_status}</strong>.
          </p>
        )}
    </div>
  );
}

