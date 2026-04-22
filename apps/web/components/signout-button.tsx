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
      className="rounded-full border border-danger-200 px-3 py-1.5 text-sm text-danger-600 hover:bg-danger-50"
    >
      Sign out
    </button>
  );
}
