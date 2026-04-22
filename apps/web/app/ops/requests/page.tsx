import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';
import { isAdminEmail } from '@/lib/admin';

export const metadata = { title: 'Access requests · Ops' };
export const dynamic = 'force-dynamic';

export default async function OpsRequestsPage() {
  const sb = getServerSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect('/login?next=/ops/requests');
  if (!isAdminEmail(auth.user.email)) {
    return (
      <p className="text-sm text-ink-600">
        You are signed in, but this page is restricted to operators.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Access requests disabled</h1>
      <p className="text-sm text-ink-600">
        This MVP now uses open email/password signup. Invite-only request review is disabled.
      </p>
      <Link href="/login" className="text-sm underline">
        Go to login/signup
      </Link>
    </div>
  );
}
