import { LoginForm } from '@/components/login-form';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata = { title: 'Sign in · Crosscheck' };

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const sb = getServerSupabase();
  const { data } = await sb.auth.getUser();
  if (data.user) redirect(searchParams.next ?? '/dashboard');

  return (
    <div className="mx-auto max-w-md space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-white/60">
          Create an account, complete onboarding once, then you land in your personal dashboard workspace.
        </p>
      </header>
      {searchParams.error && (
        <p className="rounded-md border border-danger-500/25 bg-danger-500/5 p-3 text-sm text-danger-400">
          Sign-in failed ({searchParams.error}). Please try again.
        </p>
      )}
      <div className="rounded-card border border-white/10 bg-white/[0.03] p-5">
        <LoginForm next={searchParams.next ?? '/dashboard'} />
      </div>
    </div>
  );
}
