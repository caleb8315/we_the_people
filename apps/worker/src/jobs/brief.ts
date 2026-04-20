import { statusLabel, statusShortLabel } from '@osint/core';
import type { VerificationStatus } from '@osint/core/types';
import { finishEngineRun, startEngineRun, supabase } from '../lib/supabase';
import { callLlm } from '../lib/llm';

/**
 * Brief job — daily / weekly.
 *
 * Cheap path: rank top signals heuristically, then ONE LLM call to
 * synthesize a short narrative (ONLY if budget allows). If LLM is
 * skipped, we ship a deterministic bullet-list briefing instead.
 */
export async function runBriefing(kind: 'daily' | 'weekly'): Promise<{ briefing_id: string | null }> {
  const runId = await startEngineRun('brief');
  const windowHours = kind === 'weekly' ? 24 * 7 : 24;
  const since = new Date(Date.now() - windowHours * 3600 * 1000);

  const sb = supabase();

  const { data: signals, error } = await sb
    .from('signals')
    .select('id, title, summary, topic, country_code, severity, confidence, verification_status, url, first_seen_at')
    .in('verification_status', ['verified', 'developing'])
    .gte('first_seen_at', since.toISOString())
    .order('severity', { ascending: false })
    .limit(kind === 'weekly' ? 40 : 15);

  if (error) {
    await finishEngineRun(runId, { status: 'failed', errors: [error.message] });
    return { briefing_id: null };
  }

  const items = signals ?? [];
  if (items.length === 0) {
    await finishEngineRun(runId, { status: 'success', records_in: 0, records_out: 0 });
    return { briefing_id: null };
  }

  const topics = [...new Set(items.map(s => s.topic).filter(Boolean))] as string[];
  const deterministic = renderDeterministic(kind, items);

  const prompt = buildPrompt(kind, items);
  const llm = await callLlm(prompt, { bucket: 'briefing', maxTokens: 900, temperature: 0.3 });
  const body = llm.text ? `${llm.text}\n\n---\n*Evidence:*\n${deterministic}` : deterministic;
  const headline = deriveHeadline(items);

  const { data: ins, error: insErr } = await sb
    .from('briefings')
    .upsert(
      {
        kind,
        period_start: since.toISOString(),
        period_end: new Date().toISOString(),
        headline,
        body_markdown: body,
        signal_ids: items.map(s => s.id),
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
    status: 'success',
    records_in: items.length,
    records_out: 1,
    meta: { provider: llm.provider, llm_skipped: llm.provider === 'skipped', reason: llm.reason },
  });
  console.log(`[brief] ${kind} briefing ${ins.id} (llm=${llm.provider})`);
  return { briefing_id: ins.id as string };
}

function buildPrompt(kind: 'daily' | 'weekly', items: any[]): string {
  const list = items
    .slice(0, 12)
    .map(
      (s, i) =>
        `${i + 1}. [${s.topic}/${statusShortLabel(s.verification_status as VerificationStatus)}] ${s.title} (sev=${s.severity})`,
    )
    .join('\n');

  return `
You are the Crosscheck analyst writing a ${kind} briefing. Crosscheck describes how public
reporting and open sensor evidence agree, where they conflict, and where evidence is missing.
It is not an OSINT investigation tool and not a news app.

Hard rules:
- Never tell the reader what happened or what is correct. Describe how credible public sources
  are reporting it, and cite them.
- Prefer the words agreement, conflict, corroboration, confidence, evidence, and limitation.
- Neutral tone. Never accuse. Prefer language like "reports indicate", "sources disagree",
  "observed data suggests", "corroboration is developing", "no sensor confirmation detected".
- When sources disagree, surface the disagreement (both sides + citations) rather than picking one.
- Group by topic. 3–5 short paragraphs. Under 350 words.
- End with a one-line "what to watch next 48h".

Signals (format: topic/reliability):
${list}
`.trim();
}

function renderDeterministic(kind: 'daily' | 'weekly', items: any[]): string {
  const lines = items.slice(0, 12).map(s => {
    const url = s.url ? ` — ${s.url}` : '';
    const label = statusLabel(s.verification_status as VerificationStatus);
    return `- **[${s.topic}]** ${s.title} _(severity ${s.severity}, reliability: ${label})_${url}`;
  });
  return `### ${kind === 'weekly' ? 'Weekly' : 'Daily'} — key signals\n\n${lines.join('\n')}`;
}

function deriveHeadline(items: any[]): string {
  if (items.length === 0) return 'Quiet window — no high-signal events.';
  const top = items[0];
  return `${top.topic.toUpperCase()}: ${top.title}`.slice(0, 160);
}
