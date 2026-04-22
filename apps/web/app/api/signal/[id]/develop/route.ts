/**
 * POST /api/signal/[id]/develop — run live corroboration against an
 * existing clustered signal to "develop the story". Same multi-system
 * fan-out the /verify flow uses (web search, Reddit, Bluesky, Wikipedia,
 * GDELT, sensors, tracked events), with a cooldown to avoid burning free
 * API budgets on rapid retries.
 *
 * Anonymous users can trigger this — enrichment benefits everyone, not
 * just the clicker — but a per-IP rate limit keeps it from being abused.
 * The signal's own `last_enriched_at` cooldown (5 min default) is the
 * real throttle; `force=true` is only honoured for authenticated users.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSupabase, getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { developSignal } from '@/lib/develop-signal';
import { logProductEvent } from '@/lib/product-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Same budget as /api/verify — the orchestrator's slowest leg (GDELT)
// can take 30s on free tier. 45s leaves headroom for DB writes.
export const maxDuration = 45;

const Body = z
  .object({
    force: z.boolean().optional(),
  })
  .optional();

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const rl = limit(getClientKey(req, 'signal-develop'), 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const uuidLike = /^[0-9a-f-]{16,}$/i;
  if (!params.id || !uuidLike.test(params.id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const body = parsed.data ?? {};

  // Identity check uses the cookie-based client so we know WHO is asking
  // (needed for force-bypass + telemetry), but the actual enrichment runs
  // under the service role because it has to UPDATE signals + INSERT into
  // evidence — operations RLS blocks for anon / ordinary users. Same
  // pattern /api/verify uses for its DB writes.
  const cookieSb = getServerSupabase();
  const { data: auth } = await cookieSb.auth.getUser();
  const userId = auth.user?.id ?? null;

  // Force-bypass of the cooldown is only for authenticated users so an
  // anonymous visitor can't pin the fan-out budget to one signal.
  const force = Boolean(body.force) && Boolean(userId);

  let admin;
  try {
    admin = getAdminSupabase();
  } catch (e) {
    return NextResponse.json(
      {
        status: 'error',
        new_evidence_count: 0,
        total_evidence_count: 0,
        previous_source_count: null,
        updated_source_count: null,
        previous_credible_count: null,
        updated_credible_count: null,
        previous_verification_status: null,
        updated_verification_status: null,
        systems: [],
        note: `Admin Supabase client unavailable: ${(e as Error).message}. Set SUPABASE_SERVICE_ROLE_KEY.`,
      },
      { status: 500 },
    );
  }

  let result;
  try {
    result = await developSignal(admin, params.id, { force });
  } catch (e) {
    // Don't leak the raw error to the client, but log it so ops can see
    // what actually went wrong (the UI banner was just "Request failed").
    console.error(
      `[develop] unhandled error for signal=${params.id}:`,
      (e as Error).stack ?? e,
    );
    return NextResponse.json(
      {
        status: 'error',
        new_evidence_count: 0,
        total_evidence_count: 0,
        previous_source_count: null,
        updated_source_count: null,
        previous_credible_count: null,
        updated_credible_count: null,
        previous_verification_status: null,
        updated_verification_status: null,
        systems: [],
        // Mirror the note onto `error` too, so the UI banner (which reads
        // `json.error`) surfaces the real reason instead of a generic
        // "Request failed (500)."
        error: `Enrichment crashed: ${(e as Error).message ?? 'unknown error'}`,
        note: `Enrichment crashed: ${(e as Error).message ?? 'unknown error'}`,
      },
      { status: 500 },
    );
  }

  // Log graceful-error paths too (developSignal returned status: 'error'
  // from a DB failure, for instance). Without this the terminal just
  // shows "POST ... 500" and you can't tell what went wrong.
  if (result.status === 'error') {
    console.error(
      `[develop] signal=${params.id} returned error: ${result.note ?? 'no note'}`,
    );
  }

  if (userId) {
    try {
      await logProductEvent(cookieSb, {
        userId,
        eventName: 'signal_developed',
        eventProps: {
          signal_id: params.id,
          status: result.status,
          new_evidence_count: result.new_evidence_count,
          total_evidence_count: result.total_evidence_count,
          previous_source_count: result.previous_source_count,
          updated_source_count: result.updated_source_count,
          systems_hit: result.systems.filter((s) => s.status === 'hit').length,
          systems_queried: result.systems.length,
          force,
        },
      });
    } catch {
      // telemetry is best-effort
    }
  }

  const statusCode =
    result.status === 'not_found' ? 404 : result.status === 'error' ? 500 : 200;

  // Graceful-error responses mirror `note` into `error` so the client
  // banner (which reads `json.error`) shows the specific reason instead of
  // a generic "Request failed (500)."
  const responseBody =
    result.status === 'error'
      ? { ...result, error: result.note ?? 'Enrichment failed (no detail).' }
      : result;

  return NextResponse.json(responseBody, { status: statusCode });
}
