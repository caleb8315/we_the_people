/**
 * Shared HTTP client for calling the web app's live-enrichment endpoint.
 *
 * The `/api/signal/:id/develop` route owns all the live-corroboration
 * machinery (Firecrawl / Brave / Bluesky auth, GDELT's 30s timeout,
 * per-signal cooldown, reliability recompute) because that's where the
 * env vars live. Worker jobs that want to enrich signals — the `develop`
 * cron, the briefing synthesis, future alert passes — call this helper
 * rather than duplicating the orchestrator on the worker side.
 *
 * All callers respect the endpoint's cooldown (signals enriched within
 * the last 5 min are no-ops) and the endpoint's 10/min/IP rate limit
 * (so long as callers space their requests with INTER_CALL_DELAY_MS).
 */

const PER_CALL_TIMEOUT_MS = 55_000; // web endpoint caps at 45s; 10s buffer.

export const DEVELOP_INTER_CALL_DELAY_MS = 6_000;

export interface DevelopResponse {
  status: 'enriched' | 'cooldown' | 'not_found' | 'error';
  new_evidence_count: number;
  total_evidence_count: number;
  previous_source_count: number | null;
  updated_source_count: number | null;
  previous_credible_count: number | null;
  updated_credible_count: number | null;
  previous_verification_status: string | null;
  updated_verification_status: string | null;
  systems?: Array<{ id: string; name: string; status: string; hits: number; note: string; evidence_count: number }>;
  last_enriched_at?: string | null;
  note: string | null;
}

export async function callDevelopEndpoint(
  webUrl: string,
  signalId: string,
): Promise<DevelopResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${webUrl.replace(/\/$/, '')}/api/signal/${signalId}/develop`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Distinctive UA so /api observability can see cron traffic.
        'user-agent': 'Crosscheck-Develop-Worker/1.0',
      },
      body: JSON.stringify({}),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const body = (await res.json().catch(() => null)) as DevelopResponse | null;
    if (!body) {
      return emptyError(`HTTP ${res.status} (no JSON body)`);
    }
    return body;
  } catch (e) {
    clearTimeout(timer);
    return emptyError((e as Error).message);
  }
}

function emptyError(note: string): DevelopResponse {
  return {
    status: 'error',
    new_evidence_count: 0,
    total_evidence_count: 0,
    previous_source_count: null,
    updated_source_count: null,
    previous_credible_count: null,
    updated_credible_count: null,
    previous_verification_status: null,
    updated_verification_status: null,
    note,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
