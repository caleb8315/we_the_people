'use client';

export function SignOutButton() {
  async function onClick() {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-red-500/30 px-3 py-1.5 text-red-200 hover:bg-red-500/10"
    >
      Sign out
    </button>
  );
}
