'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  InvestigationEvent,
  InvestigationPhase,
  InvestigationReport,
  PhysicalCheck,
  ReportSource,
} from '@osint/investigator/schema';
import { ReportView } from './report-view';
import { countryName, flag, isUrl, languageName } from './format';

type StreamEvent = InvestigationEvent | { type: 'ping' } | { type: 'saved'; id: string };

interface ToolRow {
  id: string;
  tool: string;
  label: string;
  status: 'running' | 'done' | 'failed';
  summary: string | null;
}

interface LiveState {
  phase: InvestigationPhase | null;
  phaseMessage: string;
  claims: string[];
  plannedLanguages: string[];
  places: string[];
  tools: ToolRow[];
  sources: ReportSource[];
  physical: PhysicalCheck[];
  notes: string[];
}

const EMPTY: LiveState = {
  phase: null,
  phaseMessage: '',
  claims: [],
  plannedLanguages: [],
  places: [],
  tools: [],
  sources: [],
  physical: [],
  notes: [],
};

const PHASES: Array<{ id: InvestigationPhase; label: string }> = [
  { id: 'intake', label: 'Read' },
  { id: 'plan', label: 'Plan' },
  { id: 'research', label: 'Investigate' },
  { id: 'synthesis', label: 'Weigh evidence' },
  { id: 'verification', label: 'Verify quotes' },
];

const EXAMPLES = [
  'Satellite images prove the Kakhovka dam was destroyed by Ukrainian shelling.',
  'Dubai floods in April 2024 were caused by cloud seeding.',
  'The 2025 Los Angeles fires were started by directed-energy weapons.',
  'Video shows the Eiffel Tower on fire this week.',
];

export function InvestigateClient({ signedIn }: { signedIn: boolean }) {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<LiveState>(EMPTY);
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const handle = useCallback((e: StreamEvent) => {
    switch (e.type) {
      case 'phase':
        setLive((s) => ({ ...s, phase: e.phase, phaseMessage: e.message }));
        break;
      case 'plan':
        setLive((s) => ({ ...s, claims: e.claims, plannedLanguages: e.languages, places: e.places }));
        break;
      case 'tool_start':
        setLive((s) => ({ ...s, tools: [...s.tools, { id: e.id, tool: e.tool, label: e.label, status: 'running', summary: null }] }));
        break;
      case 'tool_end':
        setLive((s) => {
          const exists = s.tools.some((t) => t.id === e.id);
          const tools = exists
            ? s.tools.map((t) => (t.id === e.id ? { ...t, status: e.ok ? ('done' as const) : ('failed' as const), summary: e.summary } : t))
            : [...s.tools, { id: e.id, tool: e.tool, label: e.tool.replace(/_/g, ' '), status: e.ok ? ('done' as const) : ('failed' as const), summary: e.summary }];
          return { ...s, tools };
        });
        break;
      case 'source':
        setLive((s) => ({ ...s, sources: [...s.sources, e.source] }));
        break;
      case 'physical':
        setLive((s) => ({ ...s, physical: [...s.physical, e.check] }));
        break;
      case 'note':
        setLive((s) => ({ ...s, notes: [...s.notes, e.message] }));
        break;
      case 'report':
        setReport(e.report);
        break;
      case 'saved':
        setSavedId(e.id);
        break;
      case 'error':
        setError(e.message);
        break;
      default:
        break;
    }
  }, []);

  async function start(claim?: string) {
    const value = (claim ?? input).trim();
    if (value.length < 8) {
      setError('Paste a link or write out the claim (at least a few words).');
      return;
    }
    if (claim) setInput(claim);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setReport(null);
    setSavedId(null);
    setLive(EMPTY);
    setElapsed(0);
    setRunning(true);

    const payload = isUrl(value) ? { kind: 'url', url: value } : { kind: 'text', text: value };
    try {
      const res = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        setError(errorMessage(body.error, res.status));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          try {
            handle(JSON.parse(line) as StreamEvent);
          } catch {
            // ignore malformed line
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError('The connection dropped before the investigation finished. Please try again.');
      }
    } finally {
      setRunning(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setRunning(false);
  }

  return (
    <section className="space-y-5 sm:space-y-6">
      <div className="rounded-card border border-ink-100 bg-paper p-5 shadow-card sm:p-6">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Claim, headline, or link — any language</span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !running) void start();
            }}
            rows={3}
            maxLength={6000}
            placeholder="Paste a news link, a viral post, or type the claim you want investigated…"
            className="mt-1.5 block w-full rounded-3xl border border-ink-100 bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-ink-400 shadow-card focus:border-signal-400 focus:outline-none"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-400">
            Searches news in every country involved, reads the sources, checks satellite & sensor data, and traces where it started. Takes 1–4 minutes.
          </p>
          {running ? (
            <button type="button" onClick={cancel} className="rounded-full border border-ink-200 bg-paper px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-canvas-50">
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              className="rounded-full bg-ink-900 px-6 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-ink-700"
            >
              Investigate
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}
        {!running && !report && (
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => void start(ex)}
                className="rounded-full border border-ink-100 bg-canvas-50 px-3 py-1.5 text-left text-xs text-ink-600 transition hover:border-signal-300 hover:text-ink"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {(running || (live.phase && !report)) && <LiveProgress live={live} elapsed={elapsed} running={running} />}

      {report && (
        <>
          {savedId ? (
            <p className="text-xs text-ink-500">
              Saved to your account ·{' '}
              <a href={`/investigations/${savedId}`} className="font-semibold text-signal-600 hover:underline">
                Permanent link
              </a>
            </p>
          ) : (
            !signedIn && <p className="text-xs text-ink-400">Sign in to keep a history of your investigations.</p>
          )}
          <ReportView report={report} />
        </>
      )}
    </section>
  );
}

function LiveProgress({ live, elapsed, running }: { live: LiveState; elapsed: number; running: boolean }) {
  const activeIndex = PHASES.findIndex((p) => p.id === live.phase);
  const languages = new Set([...live.plannedLanguages, ...live.sources.map((s) => s.language).filter((l): l is string => Boolean(l))]);
  const countries = new Set(live.sources.map((s) => s.country).filter((c): c is string => Boolean(c)));
  const outlets = new Set(live.sources.map((s) => s.domain));
  const recentTools = live.tools.slice(-14).reverse();
  const imagery = live.physical.flatMap((p) => p.imagery.map((img) => ({ ...img, place: p.place })));

  return (
    <section role="status" aria-live="polite" className="rounded-card border border-signal-200 bg-signal-50/40 p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="flex flex-wrap items-center gap-1.5">
          {PHASES.map((p, i) => (
            <li
              key={p.id}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                i < activeIndex || live.phase === 'done'
                  ? 'bg-signal-500 text-white'
                  : i === activeIndex
                    ? 'bg-ink-900 text-white motion-safe:animate-pulse-bar'
                    : 'bg-paper text-ink-400'
              }`}
            >
              {p.label}
            </li>
          ))}
        </ol>
        <span className="text-xs font-semibold tabular-nums text-ink-500">{running ? `${elapsed}s` : 'stopped'}</span>
      </div>

      <p className="mt-3 text-[15px] font-semibold text-ink">{live.phaseMessage || 'Starting…'}</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LiveStat label="Sources" value={live.sources.length} />
        <LiveStat label="Outlets" value={outlets.size} />
        <LiveStat label="Languages" value={languages.size} />
        <LiveStat label="Sensor & satellite checks" value={live.physical.length} />
      </dl>

      {live.claims.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">Checking these claims</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-700">
            {live.claims.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {(languages.size > 0 || countries.size > 0) && (
            <p className="mt-2 text-xs text-ink-500">
              {[...languages].slice(0, 12).map(languageName).join(' · ')}
              {countries.size > 0 && <> — {[...countries].slice(0, 12).map((c) => `${flag(c)} ${countryName(c)}`).join(' ')}</>}
            </p>
          )}
        </div>
      )}

      {imagery.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {imagery.slice(-6).map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={img.url} src={img.url} alt={`${img.label} ${img.date ?? ''} ${img.place ?? ''}`} className="aspect-square w-full rounded-lg border border-ink-100 object-cover" loading="lazy" />
          ))}
        </div>
      )}

      {recentTools.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {recentTools.map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  t.status === 'running' ? 'bg-warn-400 motion-safe:animate-pulse' : t.status === 'done' ? 'bg-signal-500' : 'bg-danger-400'
                }`}
              />
              <span className="min-w-0">
                <span className="text-ink-700">{t.label}</span>
                {t.summary && <span className="text-ink-400"> — {t.summary}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {live.notes.map((n) => (
        <p key={n} className="mt-2 text-xs text-warn-600">
          {n}
        </p>
      ))}
    </section>
  );
}

function LiveStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-paper px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="font-display text-xl font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function errorMessage(code: string | undefined, status: number): string {
  if (code === 'investigator_not_configured') return 'Deep investigation is not configured on this server yet. Use Quick check instead.';
  if (code === 'rate_limited') return 'You have run several investigations recently. Please wait a little before starting another.';
  if (code === 'sign_in_required') return 'Please sign in to run a deep investigation.';
  if (code === 'invalid_body') return 'Paste a valid link or a claim of at least a few words.';
  return `Something went wrong (${status}). Please try again.`;
}
