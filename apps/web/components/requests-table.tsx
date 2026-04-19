'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AccessRequest {
  id: string;
  email: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  processed_at: string | null;
  processed_note: string | null;
  user_agent: string | null;
  ip_hash: string | null;
}

export function RequestsTable({ initial }: { initial: AccessRequest[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<AccessRequest[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function decide(email: string, action: 'approve' | 'reject') {
    setBusy(email);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`Failed: ${body.error ?? 'unknown'}`);
      } else {
        setMsg(
          action === 'approve'
            ? `Approved ${email}. They can now sign in with Google.`
            : `Rejected ${email}`,
        );
      }
      router.refresh();
      setRows((rs) =>
        rs.map((r) =>
          r.email === email ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' } : r,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  const pending = rows.filter((r) => r.status === 'pending');
  const processed = rows.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-8">
      {msg && <p className="rounded border border-white/10 bg-white/5 p-3 text-sm">{msg}</p>}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/70">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-white/60">No pending requests.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm">{r.email}</div>
                    <div className="text-xs text-white/50">
                      requested {new Date(r.requested_at).toLocaleString()} · ip {r.ip_hash?.slice(0, 10) ?? '—'}
                    </div>
                    {r.reason && <p className="mt-2 text-sm text-white/80">{r.reason}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => decide(r.email, 'approve')}
                      disabled={busy === r.email}
                      className="rounded bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 ring-1 ring-emerald-500/30 disabled:opacity-60"
                    >
                      {busy === r.email ? '…' : 'Approve access'}
                    </button>
                    <button
                      onClick={() => decide(r.email, 'reject')}
                      disabled={busy === r.email}
                      className="rounded bg-red-500/10 px-3 py-1.5 text-sm text-red-200 ring-1 ring-red-500/30 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/70">
          Processed ({processed.length})
        </h2>
        <ul className="space-y-1 text-sm">
          {processed.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-2"
            >
              <span className="font-mono">{r.email}</span>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  r.status === 'approved'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-red-500/10 text-red-300'
                }`}
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
