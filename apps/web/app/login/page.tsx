import { LoginForm } from '@/components/login-form';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata = { title: 'Sign in · Crosscheck' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string; reason?: string };
}) {
  const sb = getServerSupabase();
  const { data } = await sb.auth.getUser();
  if (data.user) redirect(searchParams.next ?? '/dashboard');

  return (
    <div className="mx-auto max-w-md space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
          Welcome
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-500">
          Create an account, complete onboarding once, then you land in your personal dashboard
          workspace.
        </p>
      </header>
      {searchParams.reason === 'auth_unavailable' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Authentication is temporarily unavailable. Please try again in a moment.
        </p>
      )}
      {searchParams.error && (
        <p className="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
          Sign-in failed ({searchParams.error}). Please try again.
        </p>
      )}
      <div className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
        <LoginForm next={searchParams.next ?? '/dashboard'} />
      </div>
    </div>
  );
}
