import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Small, unauthenticated health probe for an external uptime monitor.
 * It confirms the web runtime and a public database read without exposing
 * operational data or requiring a user session.
 */
export async function GET() {
  try {
    const sb = getServerSupabase();
    const { error } = await sb.from('signals_public').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) {
      return NextResponse.json(
        { ok: false, service: 'crosscheck-web', database: 'down' },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        service: 'crosscheck-web',
        database: 'up',
        revision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, service: 'crosscheck-web', database: 'unknown' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
