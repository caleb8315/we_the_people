import { statusLabel, statusShortLabel } from '@osint/core';
import type { VerificationStatus } from '@osint/core/types';
import { env } from '../lib/env';
import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';
import { callLlm } from '../lib/llm';
import {
  callDevelopEndpoint,
  DEVELOP_INTER_CALL_DELAY_MS,
  sleep,
} from '../lib/develop-client';

/**
 * Brief job — daily / weekly.
 *
 * Phase 9: the briefing now pre-enriches its top candidate signals using
 * the same live-corroboration fan-out (/api/signal/:id/develop) that
 * powers the /verify flow and the signal-detail "Develop this story"
 * button. This means a briefing synthesized at 08:00 UTC sees whatever
 * new web / Reddit / Bluesky / GDELT / sensor coverage has surfaced in
 * the last hour — not just the ingest adapters' last pass.
 *
 * Pipeline:
 *   1. Select the top-severity corroborated signals in the briefing window.
 *   2. Pre-enrich those whose `last_enriched_at` is stale (null or >2h
 *      ago). Capped at MAX_PREENRICH signals so the briefing stays fast.
 *   3. Re-load the signals after enrichment so source counts / reliability
 *      labels / verification_status reflect the fresh corpus.
 *   4. Load contradictions for the final set so the briefing can call
 *      out source disagreements explicitly.
 *   5. Feed corroboration context into both the LLM prompt and the
 *      deterministic bullet list.
 *
 * Cheap path: ONE LLM call to synthesize the narrative (only if budget
 * allows). If the LLM is skipped, the deterministic briefing still
 * carries the enriched data — users don't lose the story-development
 * benefit just because the LLM budget is exhausted.
 */

const MAX_PREENRICH = 5;
const PREENRICH_STALE_HOURS = 2;

export async function runBriefing(kind: 'daily' | 'weekly'): Promise<{ briefing_id: string | null }> {
  const runId = await startEngineRun('brief');
  const windowHours = kind === 'weekly' ? 24 * 7 : 24;
  const since = new Date(Date.now() - windowHours * 3600 * 1000);
  const errors: string[] = [];

  const sb = supabase();

  // 1. Load candidates. We pull richer columns than before so the
  //    briefing can cite source counts, contradictions totals, and fresh
  //    enrichment timestamps without extra queries per signal.
  const candidatesRes = await loadCandidates(sb, since, kind);
  if (candidatesRes.error) {
    await finishEngineRun(runId, { status: 'failed', errors: [candidatesRes.error] });
    return { briefing_id: null };
  }
  let items = candidatesRes.items;
  if (items.length === 0) {
    await finishEngineRun(runId, { status: 'success', records_in: 0, records_out: 0 });
    return { briefing_id: null };
  }

  // 2. Pre-enrich the top N that are stale. Best-effort: enrichment
  //    failures don't block the briefing — we still have the pre-enrich
  //    data on file. We only enrich when WEB_APP_URL is configured.
  const webUrl = env().WEB_APP_URL?.replace(/\/$/, '') ?? null;
  let preEnriched = 0;
  if (webUrl) {
    const staleCutoff = Date.now() - PREENRICH_STALE_HOURS * 3600 * 1000;
    const stale = items
      .filter((s) => {
        const t = s.last_enriched_at ? new Date(s.last_enriched_at).getTime() : 0;
        return !t || t < staleCutoff;
      })
      .slice(0, MAX_PREENRICH);
    console.log(
      `[brief] pre-enriching ${stale.length}/${items.length} stale signals (cutoff=${PREENRICH_STALE_HOURS}h)`,
    );
    for (let i = 0; i < stale.length; i++) {
      const row = stale[i];
      if (!row) continue;
      const r = await callDevelopEndpoint(webUrl, row.id);
      if (r.status === 'enriched') {
        preEnriched++;
        console.log(
          `[brief] pre-enrich id=${row.id} new_evidence=${r.new_evidence_count} status ${r.previous_verification_status}→${r.updated_verification_status}`,
        );
      } else if (r.status !== 'cooldown') {
        errors.push(`pre-enrich signal=${row.id}: ${r.note ?? r.status}`);
      }
      if (i < stale.length - 1) await sleep(DEVELOP_INTER_CALL_DELAY_MS);
    }
    // 3. Re-load the candidates — if enrichment flipped any
    //    verification_status or updated source counts, the briefing
    //    should reflect the post-enrichment state.
    if (preEnriched > 0) {
      const reloaded = await loadCandidates(sb, since, kind);
      if (!reloaded.error && reloaded.items.length > 0) {
        items = reloaded.items;
      }
    }
  } else {
    console.log('[brief] WEB_APP_URL not set — skipping pre-enrichment.');
  }

  // 4. Load contradictions for the final candidate set. We load all at
  //    once and bucket by signal_id to avoid N+1 queries.
  const contradictionsBySignal = await loadContradictions(
    sb,
    items.map((s) => s.id),
  );

  const topics = [...new Set(items.map((s) => s.topic).filter(Boolean))] as string[];
  const enriched = items.map((s) => ({
    ...s,
    contradictions: contradictionsBySignal.get(s.id) ?? [],
  }));

  const deterministic = renderDeterministic(kind, enriched);
  const prompt = buildPrompt(kind, enriched);
  const llm = await callLlm(prompt, { bucket: 'briefing', maxTokens: 900, temperature: 0.3 });
  const body = llm.text ? `${llm.text}\n\n---\n*Evidence:*\n${deterministic}` : deterministic;
  const headline = deriveHeadline(enriched);

  const { data: ins, error: insErr } = await sb
    .from('briefings')
    .upsert(
      {
        kind,
        period_start: since.toISOString(),
        period_end: new Date().toISOString(),
        headline,
        body_markdown: body,
        signal_ids: items.map((s) => s.id),
        topics,
      },
      { onConflict: 'kind,period_start' },
    )
    .select('id')
    .single();

  if (insErr) {
    await finishEngineRun(runId, { status: 'failed', errors: [insErr.message] });
    return { briefing_id: null };
  }

  await finishEngineRun(runId, {
    status: errors.length === 0 ? 'success' : 'partial',
    records_in: items.length,
    records_out: 1,
    errors,
    meta: {
      provider: llm.provider,
      llm_skipped: llm.provider === 'skipped',
      reason: llm.reason,
      pre_enriched: preEnriched,
      total_contradictions: [...contradictionsBySignal.values()].reduce((n, a) => n + a.length, 0),
    },
  });
  console.log(
    `[brief] ${kind} briefing ${ins.id} (llm=${llm.provider}, pre_enriched=${preEnriched})`,
  );
  return { briefing_id: ins.id as string };
}

// ─── data loading ──────────────────────────────────────────────────────────

interface BriefingSignal {
  id: string;
  title: string;
  summary: string | null;
  topic: string | null;
  country_code: string | null;
  severity: number;
  confidence: number;
  verification_status: string;
  url: string | null;
  first_seen_at: string;
  source_count: number;
  credible_source_count: number;
  distinct_domains: string[] | null;
  last_enriched_at: string | null;
  tags: string[] | null;
}

interface ContradictionRow {
  type: string | null;
  severity: string | null;
  summary: string | null;
}

async function loadCandidates(
  sb: ReturnType<typeof supabase>,
  since: Date,
  kind: 'daily' | 'weekly',
): Promise<{ items: BriefingSignal[]; error?: string }> {
  const { data, error } = await sb
    .from('signals')
    .select(
      'id,title,summary,topic,country_code,severity,confidence,verification_status,url,first_seen_at,source_count,credible_source_count,distinct_domains,last_enriched_at,tags',
    )
    .in('verification_status', ['verified', 'developing'])
    .gte('first_seen_at', since.toISOString())
    .order('severity', { ascending: false })
    .limit(kind === 'weekly' ? 40 : 15);
  if (error) return { items: [], error: error.message };
  return { items: (data ?? []) as BriefingSignal[] };
}

async function loadContradictions(
  sb: ReturnType<typeof supabase>,
  signalIds: string[],
): Promise<Map<string, ContradictionRow[]>> {
  const out = new Map<string, ContradictionRow[]>();
  if (signalIds.length === 0) return out;
  const { data } = await sb
    .from('contradictions')
    .select('signal_id,type,severity,summary')
    .in('signal_id', signalIds);
  for (const row of (data ?? []) as Array<
    ContradictionRow & { signal_id: string }
  >) {
    const bucket = out.get(row.signal_id) ?? [];
    bucket.push({ type: row.type, severity: row.severity, summary: row.summary });
    out.set(row.signal_id, bucket);
  }
  return out;
}

// ─── briefing rendering ────────────────────────────────────────────────────

type EnrichedSignal = BriefingSignal & { contradictions: ContradictionRow[] };

/**
 * LLM prompt. The signals list now carries corroboration + contradictions
 * context so the model can describe HOW the story is being reported
 * (e.g. "4 credible outlets report X; 1 disagrees on casualty count")
 * instead of guessing from the title alone.
 */
function buildPrompt(kind: 'daily' | 'weekly', items: EnrichedSignal[]): string {
  const list = items
    .slice(0, 12)
    .map((s, i) => {
      const label = statusShortLabel(s.verification_status as VerificationStatus);
      const topDomains = (s.distinct_domains ?? []).slice(0, 3).join(', ') || 'none';
      const contra = s.contradictions.length > 0
        ? `, ${s.contradictions.length} source disagreement${s.contradictions.length === 1 ? '' : 's'}`
        : '';
      const enriched = s.last_enriched_at ? ', freshly corroborated' : '';
      return (
        `${i + 1}. [${s.topic}/${label}] ${s.title} ` +
        `(sev=${s.severity}, ${s.credible_source_count}/${s.source_count} credible sources, ` +
        `domains: ${topDomains}${contra}${enriched})`
      );
    })
    .join('\n');

  const contradictionsDetail = items
    .flatMap((s) =>
      s.contradictions.slice(0, 2).map((c) => ({
        title: s.title,
        type: c.type ?? 'unknown',
        severity: c.severity ?? 'medium',
        summary: c.summary ?? '',
      })),
    )
    .slice(0, 8);

  const contradictionsBlock =
    contradictionsDetail.length === 0
      ? 'None flagged this window.'
      : contradictionsDetail
          .map(
            (d) =>
              `- [${d.type}/${d.severity}] ${d.title.slice(0, 80)} — ${d.summary.slice(0, 140)}`,
          )
          .join('\n');

  return `
You are the Crosscheck analyst writing a ${kind} briefing. Crosscheck describes how public
reporting and open sensor evidence agree, where they conflict, and where evidence is missing.
It is not an OSINT investigation tool and not a news app.

Hard rules:
- Never tell the reader what happened or what is correct. Describe how credible public sources
  are reporting it, and cite them by outlet name when possible.
- Prefer the words agreement, conflict, corroboration, confidence, evidence, and limitation.
- Neutral tone. Never accuse. Prefer language like "reports indicate", "sources disagree",
  "observed data suggests", "corroboration is developing", "no sensor confirmation detected".
- Forbidden phrasing: "verified facts", "fact-checked", "debunked", "AI verified",
  "this is true/false", "this is propaganda", "this side is lying", "confirmed motive"
  (except when the underlying evidence record explicitly carries that wording).
- When sources disagree, surface the disagreement (both sides + citations) rather than picking one.
- When a signal shows "freshly corroborated", it means our live-search fan-out surfaced additional
  sources after the initial ingest — treat that as legitimate growth of coverage, not as a new event.

Required structure (use these exact section headings, in order):
1. **Summary** — 3–4 bullets, each starting with the event in plain language.
2. **Why it matters** — short bullets that explain impact/risk without hype.
3. **Confirmed** — bullets for what is clearly supported right now.
4. **Disputed / uncertain** — bullets for active disagreements or evidence gaps.
5. **Watch next** — neutral, concrete checks for the next update window.
6. **Source note** — one short paragraph explaining source independence and any republishing caveat.

Evidence-state labels:
- Prefix EACH bullet in Confirmed / Disputed / Watch next with one of:
  - Confirmed
  - Reported by multiple independent sources
  - Reported by one source
  - Disputed
  - Missing evidence
- If many outlets are republishing the same original article, say so explicitly in Source note.

Hard length cap: 350 words total. Group by topic where it makes sense.

Signals (format: topic/reliability, with credible/total source count and top domains):
${list}

Source disagreements flagged this window:
${contradictionsBlock}
`.trim();
}

/**
 * Deterministic evidence section. Appears below the LLM narrative (or
 * replaces it when the LLM is skipped). Now shows source counts, top
 * credible domains, and a warning when contradictions are flagged —
 * so users get real corroboration context even on LLM-skipped runs.
 */
function renderDeterministic(kind: 'daily' | 'weekly', items: EnrichedSignal[]): string {
  const _kind = kind;
  const top = items.slice(0, 10);
  const summaryLines = top.slice(0, 4).map((s) => {
    const sourceWord = s.source_count === 1 ? 'source' : 'sources';
    return `- [${String(s.topic ?? 'other')}] ${s.title} (${s.source_count} ${sourceWord})`;
  });
  const whyLines = top.slice(0, 3).map((s) => {
    const note =
      s.severity >= 85
        ? 'high-severity signal'
        : s.contradictions.length > 0
          ? 'source disagreement can change interpretation'
          : 'developing corroboration may shift confidence';
    return `- ${s.title.slice(0, 80)} — ${note}`;
  });
  const confirmedLines = top.slice(0, 4).map((s) => {
    const state =
      s.contradictions.length > 0
        ? 'Disputed'
        : s.source_count <= 1
          ? 'Reported by one source'
          : s.credible_source_count >= 2
            ? 'Confirmed'
            : 'Reported by multiple independent sources';
    return `- ${state}: ${s.title.slice(0, 110)}`;
  });
  const disputedLines = top
    .filter((s) => s.contradictions.length > 0 || s.source_count <= 1)
    .slice(0, 4)
    .map((s) => {
      if (s.contradictions.length > 0) {
        return `- Disputed: ${s.title.slice(0, 100)} (${s.contradictions.length} disagreement${s.contradictions.length === 1 ? '' : 's'})`;
      }
      return `- Missing evidence: ${s.title.slice(0, 100)} (single-source coverage)`;
    });
  const watchLines = top.slice(0, 4).map((s) => {
    const prefix =
      s.contradictions.length > 0
        ? 'Disputed'
        : s.source_count <= 1
          ? 'Reported by one source'
          : 'Reported by multiple independent sources';
    return `- ${prefix}: monitor updates for ${s.title.slice(0, 80)}`;
  });
  const domains = [...new Set(top.flatMap((s) => (s.distinct_domains ?? []).slice(0, 2)))];
  const sourceNote = `Cluster window includes ${top.length} top signals. Source counts reflect independent domains where possible; repeated republishing can inflate counts. Key domains: ${domains.slice(0, 8).join(', ') || 'none listed'}.`;
  return [
    `### Summary`,
    summaryLines.join('\n') || '- No high-signal developments in this window.',
    '',
    `### Why it matters`,
    whyLines.join('\n') || '- Corroboration and disagreement changes alter risk interpretation.',
    '',
    `### Confirmed`,
    confirmedLines.join('\n') || '- Missing evidence: no confirmed points in this window.',
    '',
    `### Disputed / uncertain`,
    disputedLines.join('\n') || '- Missing evidence: no major disputes flagged, but coverage is still evolving.',
    '',
    `### Watch next`,
    watchLines.join('\n') || '- Reported by one source: watch for independent confirmation.',
    '',
    `### Source note`,
    sourceNote,
  ].join('\n');
}

function deriveHeadline(items: EnrichedSignal[]): string {
  if (items.length === 0) return 'Quiet window — no high-signal events.';
  const top = items[0]!;
  return `${(top.topic ?? 'event').toUpperCase()}: ${top.title}`.slice(0, 160);
}
