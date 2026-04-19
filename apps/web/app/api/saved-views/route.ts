import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';
import { logProductEvent } from '@/lib/product-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SavedViewBody = z.object({
  name: z.string().trim().min(1).max(80),
  context: z.enum(['feed', 'intel']),
  view_mode: z.enum(['list', 'map']),
  filters: z.record(z.unknown()).optional(),
});

export async function GET(req: Request) {
  const rl = limit(getClientKey(req, 'saved-views-get'), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const context = url.searchParams.get('context');
  let q = sb
    .from('user_saved_views')
    .select('id, name, context, view_mode, filters, updated_at')
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false })
    .limit(20);
  if (context === 'feed' || context === 'intel') q = q.eq('context', context);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ views: data ?? [] });
}

export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'saved-views-post'), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await req.json().catch(() => null);
  } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    let parsedFilters: Record<string, unknown> = {};
    const rawFilters = String(form.get('filters') ?? '{}');
    try {
      parsedFilters = JSON.parse(rawFilters);
    } catch {
      parsedFilters = {};
    }
    body = {
      name: String(form.get('name') ?? ''),
      context: String(form.get('context') ?? ''),
      view_mode: String(form.get('view_mode') ?? ''),
      filters: parsedFilters,
    };
  } else {
    return NextResponse.json({ error: 'unsupported_content_type' }, { status: 400 });
  }

  const parsed = SavedViewBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await sb
    .from('user_saved_views')
    .insert({
      user_id: auth.user.id,
      name: parsed.data.name,
      context: parsed.data.context,
      view_mode: parsed.data.view_mode,
      filters: parsed.data.filters ?? {},
    })
    .select('id, name, context, view_mode, filters, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logProductEvent(sb, {
    userId: auth.user.id,
    eventName: 'saved_view_applied',
    eventProps: {
      action: 'created',
      context: parsed.data.context,
      view_mode: parsed.data.view_mode,
      has_filters: Object.keys(parsed.data.filters ?? {}).length > 0,
    },
  });

  const wantsRedirect = !contentType.includes('application/json');
  if (wantsRedirect) {
    return NextResponse.redirect(new URL(parsed.data.context === 'feed' ? '/feed' : '/dashboard/intel', req.url), 303);
  }
  return NextResponse.json({ ok: true, view: data });
}
