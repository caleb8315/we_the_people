import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  signal_id: z.string().uuid().optional(),
  url: z.string().url().optional(),
}).refine(d => d.signal_id || d.url, { message: 'Provide signal_id or url' });

/**
 * POST /api/deep-dive/request
 * Request a deep dive for a signal or an external URL.
 * Rate limited to 5 requests per hour per client.
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'deep-dive-request'), 5, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Deep dive requests are limited to 5 per hour. Please try again later.' },
      { status: 429 },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const sb = getAdminSupabase();

  if (body.signal_id) {
    // Check if a dive already exists
    const { data: existing } = await sb
      .from('deep_dives')
      .select('id, status')
      .eq('signal_id', body.signal_id)
      .in('status', ['complete', 'running', 'pending'])
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        status: existing.status,
        message: existing.status === 'complete'
          ? 'Research already completed for this signal.'
          : 'Research is currently in progress. Check back shortly.',
        dive_id: existing.id,
      });
    }

    // Verify signal exists
    const { data: signal } = await sb
      .from('signals')
      .select('id, title')
      .eq('id', body.signal_id)
      .maybeSingle();

    if (!signal) {
      return NextResponse.json({ error: 'signal_not_found' }, { status: 404 });
    }

    // Create a pending deep dive
    const { data: dive, error: insertErr } = await sb
      .from('deep_dives')
      .insert({
        signal_id: body.signal_id,
        status: 'pending',
        auto_generated: false,
      })
      .select('id')
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      status: 'pending',
      message: 'Research queued. Results will appear on the signal page within the next scheduled research cycle.',
      dive_id: dive.id,
    });
  }

  if (body.url) {
    // Check if we already have a dive for this URL
    const { data: existing } = await sb
      .from('deep_dives')
      .select('id, status, signal_id')
      .eq('source_url', body.url)
      .in('status', ['complete', 'running', 'pending'])
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        status: existing.status,
        message: existing.status === 'complete'
          ? 'Research already completed for this article.'
          : 'Research is currently in progress. Check back shortly.',
        dive_id: existing.id,
        signal_id: existing.signal_id,
      });
    }

    // Create a pending deep dive for the URL
    const { data: dive, error: insertErr } = await sb
      .from('deep_dives')
      .insert({
        source_url: body.url,
        status: 'pending',
        auto_generated: false,
      })
      .select('id')
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      status: 'pending',
      message: 'Research queued for this article. Results will be available within the next scheduled research cycle.',
      dive_id: dive.id,
    });
  }

  return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
}
