import { LoginForm } from '@/components/login-form';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata = { title: 'Sign in · OSINT Platform' };

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const sb = getServerSupabase();
  const { data } = await sb.auth.getUser();
  if (data.user) redirect(searchParams.next ?? '/dashboard');

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-sm text-white/60">
        Create an account, complete onboarding once, then you land in your personal dashboard workspace.
      </p>
      {searchParams.error && (
        <p className="rounded border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
          Sign-in failed ({searchParams.error}). Please try again.
        </p>
      )}
      <LoginForm next={searchParams.next ?? '/dashboard'} />
    </div>
  );
}
