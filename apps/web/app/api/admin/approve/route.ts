import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSupabase, getServerSupabase } from '@/lib/supabase-server';
import { isAdminEmail } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email(),
  action: z.enum(['approve', 'reject']),
  note: z.string().max(400).optional(),
});

/**
 * POST /api/admin/approve
 *   { email, action: 'approve' | 'reject', note? }
 *
 * Approve: flips access_requests.status to 'approved'. DB trigger copies
 *          email into beta_allowlist immediately.
 * Reject:  flips to 'rejected'.
 *
 * No email is sent here. Approved users sign in with Google OAuth.
 */
export async function POST(req: Request) {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdminEmail(auth.user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const { email, action, note } = parsed.data;
  const lower = email.toLowerCase();

  const admin = getAdminSupabase();
  const { error } = await admin
    .from('access_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      processed_note: note ?? auth.user.email ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq('email', lower);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, action });
}
