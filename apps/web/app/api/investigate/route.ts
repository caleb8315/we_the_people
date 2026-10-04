import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  investigatorConfigured,
  InvestigatorNotConfiguredError,
  runInvestigation,
  type InvestigationEvent,
  type InvestigationReport,
} from '@osint/investigator';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { logProductEvent } from '@/lib/product-events';

/**
 * POST /api/investigate — run a deep, agentic investigation and stream its
 * progress as newline-delimited JSON (one InvestigationEvent per line).
 *
 * The run plans, searches news in the languages of every country involved,
 * reads sources in full, checks sensor and satellite data for physical
 * claims, traces the claim's origin, and finishes with a `report` event whose
 * citations have been verified against the retrieved text.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vercel Hobby (fluid compute) allows 300s; the investigator budgets 270s.
export const maxDuration = 300;

const Body = z
  .object({
    kind: z.enum(['url', 'text']),
    url: z.string().url().max(2000).optional(),
    text: z.string().min(8).max(6000).optional(),
  })
  .refine((b) => (b.kind === 'url' ? Boolean(b.url) : Boolean(b.text)), { message: 'missing_input' });

const PER_IP_PER_HOUR = Number(process.env.INVESTIGATE_PER_HOUR ?? 6);

export async function GET() {
  return NextResponse.json({ available: investigatorConfigured() });
}

export async function POST(req: Request) {
  if (!investigatorConfigured()) {
    return NextResponse.json({ error: 'investigator_not_configured' }, { status: 503 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const body = parsed.data;

  let userId: string | null = null;
  let sb: ReturnType<typeof getServerSupabase> | null = null;
  try {
    sb = getServerSupabase();
    const { data } = await sb.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    sb = null;
  }
  if (process.env.INVESTIGATE_REQUIRE_AUTH === 'true' && !userId) {
    return NextResponse.json({ error: 'sign_in_required' }, { status: 401 });
  }

  const rl = limit(getClientKey(req, userId ? `investigate:${userId}` : 'investigate'), userId ? PER_IP_PER_HOUR * 2 : PER_IP_PER_HOUR, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited', reset_at: rl.resetAt }, { status: 429 });

  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener('abort', () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: InvestigationEvent | { type: 'ping' } | { type: 'saved'; id: string }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => send({ type: 'ping' }), 10_000);

      try {
        const report = await runInvestigation(
          { kind: body.kind, url: body.url ?? null, text: body.text ?? null },
          { emit: send, signal: abort.signal },
        );
        if (userId && sb) {
          const id = await persist(sb, userId, report);
          if (id) send({ type: 'saved', id });
          await logProductEvent(sb, {
            userId,
            eventName: 'investigation_completed',
            eventProps: {
              verdict: report.verdict,
              confidence: report.confidence,
              languages: report.coverage.languages.length,
              countries: report.coverage.countries.length,
              sources_found: report.coverage.sources_found,
              sources_read: report.coverage.sources_read,
              physical_checks: report.physical_checks.length,
              duration_ms: report.duration_ms,
            },
          }).catch(() => undefined);
        }
      } catch (err) {
        const message =
          err instanceof InvestigatorNotConfiguredError
            ? 'The investigation engine is not configured on this server.'
            : abort.signal.aborted
              ? 'Investigation cancelled.'
              : 'The investigation failed before it could finish. Please try again.';
        send({ type: 'error', message });
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // stream already closed by the client
          }
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}

async function persist(
  sb: ReturnType<typeof getServerSupabase>,
  userId: string,
  report: InvestigationReport,
): Promise<string | null> {
  const { data, error } = await sb
    .from('investigations')
    .insert({
      user_id: userId,
      input_kind: report.input.kind,
      input_url: report.input.url,
      input_text: report.input.text,
      headline_claim: report.headline_claim.slice(0, 1000),
      verdict: report.verdict,
      confidence: report.confidence,
      conspiracy_level: report.conspiracy.level,
      languages: report.coverage.languages,
      countries: report.coverage.countries,
      sources_found: report.coverage.sources_found,
      sources_read: report.coverage.sources_read,
      physical_checks: report.physical_checks.length,
      model: report.model,
      duration_ms: report.duration_ms,
      report,
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}
