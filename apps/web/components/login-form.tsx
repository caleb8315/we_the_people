'use client';

import { useState } from 'react';
import { Segmented } from './ui/segmented';
import { sanitizeNextPath } from '@/lib/safe-redirect';

type Mode = 'signin' | 'signup';
type Result = { ok: boolean; message: string } | null;

export function LoginForm({ next }: { next: string }) {
  const safeNext = sanitizeNextPath(next);
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
            'Account created. You can sign in immediately if your project does not require email confirmation.',
        });
        setMode('signin');
      } else {
        window.location.href = safeNext;
      }
    } catch {
      setResult({ ok: false, message: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <Segmented
        ariaLabel="Auth mode"
        active={mode}
        onSelect={(v) => setMode(v as Mode)}
        className="w-full"
        options={[
          { label: 'Sign in', value: 'signin' },
          { label: 'Sign up', value: 'signup' },
        ]}
      />

      <form onSubmit={onSubmit} className="space-y-3">
        {mode === 'signup' && (
          <Field label="Display name (optional)">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-control"
              placeholder="Analyst Zero"
            />
          </Field>
        )}

        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-control"
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-control"
            placeholder="At least 8 characters"
          />
        </Field>

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
        >
          {loading ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      {result && (
        <p className={`text-sm ${result.ok ? 'text-brand-700' : 'text-danger-600'}`}>
          {result.message}
        </p>
      )}

      <p className="text-xs text-ink-400">
        If your Supabase project requires email confirmation, finish that step before signing in.
      </p>

    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm text-ink-600">
      <span className="mb-1 inline-block text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </span>
      {children}
    </label>
  );
}
