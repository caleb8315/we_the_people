'use client';

import { useState } from 'react';

type Mode = 'signin' | 'signup';
type Result = { ok: boolean; message: string } | null;

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const endpoint = mode === 'signin' ? '/api/auth/signin' : '/api/auth/signup';
    const payload: Record<string, string> = { email, password };
    if (mode === 'signup' && displayName.trim()) payload.display_name = displayName.trim();

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setResult({ ok: false, message: body.error ?? 'Authentication failed.' });
      } else if (mode === 'signup') {
        setResult({
          ok: true,
          message:
            'Account created. If email confirmation is disabled in Supabase, you can sign in immediately.',
        });
        setMode('signin');
      } else {
        window.location.href = next || '/feed';
      }
    } catch {
      setResult({ ok: false, message: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-lg border border-white/10 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode('signin')}
          className={`rounded py-2 ${mode === 'signin' ? 'bg-white text-black' : 'text-white/70'}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={`rounded py-2 ${mode === 'signup' ? 'bg-white text-black' : 'text-white/70'}`}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {mode === 'signup' && (
          <label className="block text-sm text-white/70">
            Display name (optional)
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/40"
              placeholder="Analyst Zero"
            />
          </label>
        )}

        <label className="block text-sm text-white/70">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/40"
            placeholder="you@example.com"
          />
        </label>

        <label className="block text-sm text-white/70">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/40"
            placeholder="At least 8 characters"
          />
        </label>

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-60"
        >
          {loading ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      {result && (
        <p className={`text-sm ${result.ok ? 'text-emerald-300' : 'text-red-300'}`}>{result.message}</p>
      )}

      <p className="text-xs text-white/50">
        MVP mode: email/password auth. In Supabase Auth settings, disable “Confirm email” for instant signup login.
      </p>
    </div>
  );
}
