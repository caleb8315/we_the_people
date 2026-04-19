import Link from 'next/link';

export const metadata = { title: 'Access requests · Ops' };

export default function OpsRequestsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Access requests disabled</h1>
      <p className="text-sm text-white/70">
        This MVP now uses open email/password signup. Invite-only request review is disabled.
      </p>
      <Link href="/login" className="text-sm underline">
        Go to login/signup
      </Link>
    </div>
  );
}
