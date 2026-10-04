/**
 * Run one investigation from the terminal.
 *
 *   npm run investigate --workspace packages/investigator -- "Claim text"
 *   npm run investigate --workspace packages/investigator -- --url https://…
 *   … -- --json "Claim"      (print the full report JSON)
 */
import { runInvestigation } from './agent';
import { VERDICT_LABEL, type InvestigationEvent } from './schema';

const args = process.argv.slice(2);
const json = args.includes('--json');
let url: string | undefined;
const positional: string[] = [];
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]!;
  if (a === '--url') {
    url = args[(i += 1)];
    continue;
  }
  if (!a.startsWith('--')) positional.push(a);
}
const text = positional.join(' ').trim();

if (!url && !text) {
  console.error('Usage: investigate "claim text" | --url <link> [--json]');
  process.exit(1);
}

const log = (e: InvestigationEvent) => {
  if (json) return;
  switch (e.type) {
    case 'phase':
      console.log(`\n▶ ${e.message}`);
      break;
    case 'plan':
      console.log(`  claims: ${e.claims.join(' | ')}\n  languages: ${e.languages.join(', ')}  places: ${e.places.join(', ')}`);
      break;
    case 'tool_start':
      console.log(`  · ${e.label}`);
      break;
    case 'tool_end':
      console.log(`    ${e.ok ? '✓' : '✗'} ${e.summary}`);
      break;
    case 'note':
      console.log(`  ! ${e.message}`);
      break;
    default:
      break;
  }
};

let report;
try {
  report = await runInvestigation(url ? { kind: 'url', url, text: text || null } : { kind: 'text', text }, { emit: log });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n══ ${VERDICT_LABEL[report.verdict].toUpperCase()} (${report.confidence} confidence) ══`);
  console.log(report.headline_claim);
  console.log(`\n${report.bottom_line}`);
  console.log(`\nFake? ${report.is_it_fake.answer} — ${report.is_it_fake.explanation}`);
  console.log(`Conspiracy? ${report.conspiracy.level} — ${report.conspiracy.explanation}`);
  console.log(`\nWhat is true: ${report.what_is_true}`);
  for (const s of report.sides) console.log(`\n[${s.countries.join(',')}] ${s.perspective} (${s.evidence_strength}): ${s.position}`);
  for (const p of report.physical_checks) console.log(`\n${p.id} ${p.kind}: ${p.observation} → ${p.result}${p.interpretation ? ` — ${p.interpretation}` : ''}`);
  console.log(`\nSources: ${report.coverage.sources_found} found, ${report.coverage.sources_read} read · languages: ${report.coverage.languages.join(', ')} · quotes verified ${report.integrity.citations_verified}/${report.integrity.citations_checked} · ${Math.round(report.duration_ms / 1000)}s · ${report.model}`);
  for (const g of report.integrity.guardrails) console.log(`  guardrail: ${g}`);
}
