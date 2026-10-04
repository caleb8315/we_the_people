/**
 * Accuracy benchmark for the investigator.
 *
 *   npm run eval --workspace packages/investigator -- [--limit N] [--id <id>] [--concurrency 2]
 *
 * Needs a model key (AI_GATEWAY_API_KEY recommended). Writes a JSON results
 * file to evals/results/ and prints verdict accuracy, conspiracy accuracy,
 * citation integrity, language coverage, and latency.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInvestigation } from '../src/agent';
import { resolveModels } from '../src/model';
import type { InvestigationReport, Verdict } from '../src/schema';

interface EvalCase {
  id: string;
  claim: string;
  language?: string;
  expect: Verdict[];
  conspiracy: 'none' | 'strong' | 'some_traits_or_strong' | 'any';
  physical: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, 'claims.json'), 'utf8')) as EvalCase[];

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = arg('id');
const limitN = Number(arg('limit') ?? cases.length);
const concurrency = Number(arg('concurrency') ?? 2);
const selected = cases.filter((c) => !only || c.id === only).slice(0, limitN);

if (!resolveModels()) {
  console.error('No model configured. Set AI_GATEWAY_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY).');
  process.exit(1);
}

interface Row {
  id: string;
  expected: Verdict[];
  verdict: Verdict | 'error';
  verdict_ok: boolean;
  conspiracy_ok: boolean;
  confidence?: string;
  citations_verified?: number;
  citations_checked?: number;
  languages?: number;
  sources_read?: number;
  physical_checks?: number;
  physical_expected: boolean;
  duration_s?: number;
  error?: string;
}

function conspiracyOk(c: EvalCase, r: InvestigationReport): boolean {
  switch (c.conspiracy) {
    case 'any':
      return true;
    case 'none':
      return r.conspiracy.level === 'none';
    case 'strong':
      return r.conspiracy.level === 'strong';
    case 'some_traits_or_strong':
      return r.conspiracy.level !== 'none';
  }
}

const rows: Row[] = [];
const queue = [...selected];
async function worker() {
  for (let c = queue.shift(); c; c = queue.shift()) {
    process.stdout.write(`… ${c.id}\n`);
    try {
      const r = await runInvestigation({ kind: 'text', text: c.claim });
      const row: Row = {
        id: c.id,
        expected: c.expect,
        verdict: r.verdict,
        verdict_ok: c.expect.includes(r.verdict),
        conspiracy_ok: conspiracyOk(c, r),
        confidence: r.confidence,
        citations_verified: r.integrity.citations_verified,
        citations_checked: r.integrity.citations_checked,
        languages: r.coverage.languages.length,
        sources_read: r.coverage.sources_read,
        physical_checks: r.physical_checks.length,
        physical_expected: c.physical,
        duration_s: Math.round(r.duration_ms / 1000),
      };
      rows.push(row);
      console.log(`${row.verdict_ok ? '✓' : '✗'} ${c.id}: ${r.verdict} (${r.confidence}) expected ${c.expect.join('/')} · ${row.citations_verified}/${row.citations_checked} quotes · ${row.languages} langs · ${row.physical_checks} physical · ${row.duration_s}s`);
    } catch (err) {
      rows.push({ id: c.id, expected: c.expect, verdict: 'error', verdict_ok: false, conspiracy_ok: false, physical_expected: c.physical, error: err instanceof Error ? err.message : String(err) });
      console.log(`✗ ${c.id}: error ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

const n = rows.length || 1;
const pct = (k: number) => `${Math.round((k / n) * 100)}%`;
const verdictAcc = rows.filter((r) => r.verdict_ok).length;
const conspAcc = rows.filter((r) => r.conspiracy_ok).length;
const quotesV = rows.reduce((s, r) => s + (r.citations_verified ?? 0), 0);
const quotesC = rows.reduce((s, r) => s + (r.citations_checked ?? 0), 0);
const physicalRecall = rows.filter((r) => r.physical_expected);
const physicalHit = physicalRecall.filter((r) => (r.physical_checks ?? 0) > 0).length;
const summary = {
  cases: rows.length,
  verdict_accuracy: pct(verdictAcc),
  conspiracy_accuracy: pct(conspAcc),
  quote_integrity: quotesC ? `${Math.round((quotesV / quotesC) * 100)}% (${quotesV}/${quotesC})` : 'n/a',
  physical_check_recall: physicalRecall.length ? `${physicalHit}/${physicalRecall.length}` : 'n/a',
  mean_languages: (rows.reduce((s, r) => s + (r.languages ?? 0), 0) / n).toFixed(1),
  mean_duration_s: Math.round(rows.reduce((s, r) => s + (r.duration_s ?? 0), 0) / n),
  model: resolveModels()?.label,
};
console.log('\nSUMMARY', JSON.stringify(summary, null, 2));

mkdirSync(join(here, 'results'), { recursive: true });
const out = join(here, 'results', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
console.log(`Results written to ${out}`);
