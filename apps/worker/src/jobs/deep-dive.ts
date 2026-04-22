import {
  type Claim,
  type ResearchFinding,
  type SensorReading,
  type ClaimVerdict,
  type DeepDiveResult,
  CLAIM_EXTRACTION_PROMPT,
  QUERY_GENERATION_PROMPT,
  SYNTHESIS_PROMPT,
  parseLLMJson,
  buildArticleText,
} from '@osint/core/deep-dive';
import { supabase } from '../lib/supabase';

// ── LLM Clients (with retry + fallback) ─────────────────────────────────

async function groqChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: Record<string, unknown> = {},
): Promise<{ text: string; ok: boolean }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { text: '', ok: false };

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.1,
    max_tokens: 2000,
    ...options,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        console.warn(`[deep-dive] Groq rate limited (attempt ${attempt + 1})`);
        if (attempt === 0) { await sleep(2000); continue; }
        return { text: '', ok: false };
      }
      if (!res.ok) {
        console.warn(`[deep-dive] Groq ${res.status} on ${model}`);
        return { text: '', ok: false };
      }

      const data = await res.json() as any;
      const text = data.choices?.[0]?.message?.content ?? '';
      return { text, ok: text.length > 0 };
    } catch (err) {
      console.warn(`[deep-dive] Groq network error: ${(err as Error).message}`);
      if (attempt === 0) { await sleep(1000); continue; }
      return { text: '', ok: false };
    }
  }
  return { text: '', ok: false };
}

async function groqCompound(query: string): Promise<{ text: string; ok: boolean }> {
  return groqChat('groq/compound-mini', [
    { role: 'user', content: query },
  ]);
}

async function geminiChat(prompt: string): Promise<{ text: string; ok: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { text: '', ok: false };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 3000 },
          }),
        },
      );

      if (res.status === 429) {
        console.warn(`[deep-dive] Gemini rate limited (attempt ${attempt + 1})`);
        if (attempt === 0) { await sleep(2000); continue; }
        return { text: '', ok: false };
      }
      if (!res.ok) {
        console.warn(`[deep-dive] Gemini ${res.status}`);
        return { text: '', ok: false };
      }

      const data = await res.json() as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return { text, ok: text.length > 0 };
    } catch (err) {
      console.warn(`[deep-dive] Gemini network error: ${(err as Error).message}`);
      if (attempt === 0) { await sleep(1000); continue; }
      return { text: '', ok: false };
    }
  }
  return { text: '', ok: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Live Sensor Queries ─────────────────────────────────────────────────

async function queryUSGS(title: string): Promise<SensorReading | null> {
  const hasQuakeTerms = /earthquake|quake|seismic|tremor|aftershock/i.test(title);
  if (!hasQuakeTerms) return null;

  try {
    const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
    const res = await fetch(url, { headers: { 'user-agent': 'Crosscheck-Bot/1.0' } });
    if (!res.ok) {
      return {
        source: 'USGS Earthquake Hazards Program',
        type: 'seismic',
        data: { error: 'service_unavailable' },
        summary: 'USGS seismic data temporarily unavailable. This does not indicate absence of seismic activity.',
        confirms_event: null,
        timestamp: new Date().toISOString(),
      };
    }
    const data = await res.json() as any;
    const features = data.features ?? [];

    if (features.length === 0) {
      return {
        source: 'USGS Earthquake Hazards Program',
        type: 'seismic',
        data: { earthquakes_today: 0 },
        summary: 'No M4.5+ earthquakes detected by USGS in the last 24 hours. Note: sub-M4.5 events and some regions have limited coverage.',
        confirms_event: false,
        timestamp: new Date().toISOString(),
      };
    }

    const strongest = features.reduce((max: any, f: any) =>
      (f.properties?.mag ?? 0) > (max.properties?.mag ?? 0) ? f : max, features[0]);

    return {
      source: 'USGS Earthquake Hazards Program',
      type: 'seismic',
      data: {
        earthquakes_today: features.length,
        strongest_magnitude: strongest.properties?.mag,
        strongest_location: strongest.properties?.place,
        strongest_time: strongest.properties?.time ? new Date(strongest.properties.time).toISOString() : null,
        coordinates: strongest.geometry?.coordinates,
      },
      summary: `USGS reports ${features.length} M4.5+ earthquakes in the last 24h. Strongest: M${strongest.properties?.mag} near ${strongest.properties?.place}.`,
      confirms_event: hasQuakeTerms && features.length > 0,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      source: 'USGS Earthquake Hazards Program',
      type: 'seismic',
      data: { error: 'connection_failed' },
      summary: 'Could not reach USGS seismic network. This does not indicate absence of seismic activity.',
      confirms_event: null,
      timestamp: new Date().toISOString(),
    };
  }
}

async function queryFIRMS(title: string): Promise<SensorReading | null> {
  const hasFireTerms = /fire|explosion|strike|airstrike|bombing|blast|burn|thermal/i.test(title);
  const hasConflictRegion = /gaza|israel|ukraine|kyiv|syria|yemen|sudan|sahel/i.test(title);
  if (!hasFireTerms && !hasConflictRegion) return null;

  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) {
    return {
      source: 'NASA FIRMS (VIIRS NOAA-20)',
      type: 'thermal',
      data: { error: 'no_api_key' },
      summary: 'NASA FIRMS thermal detection not configured. Satellite fire/thermal anomaly data is unavailable for this report.',
      confirms_event: null,
      timestamp: new Date().toISOString(),
    };
  }

  let bbox = '-180,-90,180,90';
  if (/gaza|israel/i.test(title)) bbox = '34,31,35,32';
  else if (/ukraine|kyiv/i.test(title)) bbox = '22,44,42,53';
  else if (/syria/i.test(title)) bbox = '35,32,42,37';
  else if (/yemen/i.test(title)) bbox = '42,12,54,19';
  else if (/sudan/i.test(title)) bbox = '21,3,39,23';

  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/VIIRS_NOAA20_NRT/${bbox}/1`;
    const res = await fetch(url, { headers: { 'user-agent': 'Crosscheck-Bot/1.0' } });
    if (!res.ok) {
      return {
        source: 'NASA FIRMS (VIIRS NOAA-20)',
        type: 'thermal',
        data: { error: 'service_unavailable' },
        summary: 'NASA FIRMS thermal detection temporarily unavailable. Satellite data could not be retrieved for this report.',
        confirms_event: null,
        timestamp: new Date().toISOString(),
      };
    }
    const text = await res.text();
    const lines = text.trim().split('\n');
    const fireCount = Math.max(0, lines.length - 1);
    const highConfidence = lines.filter(l => l.toLowerCase().includes('high')).length;

    return {
      source: 'NASA FIRMS (VIIRS NOAA-20)',
      type: 'thermal',
      data: {
        total_detections: fireCount,
        high_confidence: highConfidence,
        region: bbox,
        sensor: 'VIIRS NOAA-20 NRT',
      },
      summary: fireCount > 0
        ? `NASA FIRMS detected ${fireCount} thermal anomalies (${highConfidence} high-confidence) in the target area in the last 24h.`
        : 'No thermal anomalies detected by NASA FIRMS in the target area in the last 24h. Note: satellite revisit cadence may delay detection by 1-12 hours.',
      confirms_event: highConfidence > 0,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      source: 'NASA FIRMS (VIIRS NOAA-20)',
      type: 'thermal',
      data: { error: 'connection_failed' },
      summary: 'Could not reach NASA FIRMS satellite service. Thermal anomaly data is unavailable for this report.',
      confirms_event: null,
      timestamp: new Date().toISOString(),
    };
  }
}

// ── Deterministic fallback when ALL AI fails ────────────────────────────

function buildFallbackResult(
  title: string,
  summary: string | null,
  evidenceExcerpts: string[],
  sensorData: SensorReading[],
  failures: string[],
  durationMs: number,
): DeepDiveResult {
  const sourceCount = evidenceExcerpts.length;
  const hasSensorConfirmation = sensorData.some(s => s.confirms_event === true);

  let fallbackSummary: string;
  if (failures.length === 3) {
    fallbackSummary = `Research services are temporarily at capacity. This event is tracked by ${sourceCount} source${sourceCount === 1 ? '' : 's'} in our monitoring network.`;
  } else {
    fallbackSummary = `Some research steps could not be completed at this time. The information below reflects what was available.`;
  }

  if (hasSensorConfirmation) {
    fallbackSummary += ' Physical sensor data was successfully retrieved and is shown below.';
  }
  if (sensorData.some(s => s.confirms_event === null)) {
    fallbackSummary += ' Some sensor networks could not be reached — this does not indicate absence of physical evidence.';
  }

  return {
    claims: [],
    research: [],
    sensor_data: sensorData,
    verdicts: [],
    overall_verdict: 'unverified',
    summary: fallbackSummary,
    research_duration_ms: durationMs,
  };
}

// ── Main Pipeline ───────────────────────────────────────────────────────

export async function runDeepDive(
  diveId: string,
  title: string,
  summary: string | null,
  evidenceExcerpts: string[],
  topic: string,
): Promise<DeepDiveResult> {
  const start = Date.now();
  const sb = supabase();
  const failures: string[] = [];

  await sb.from('deep_dives').update({ status: 'running' }).eq('id', diveId);

  // ── Step 4 (early): Live sensor queries — these don't use AI ────────
  // Run sensors first since they're the most reliable data source
  // and work even when all AI services are down.
  console.log(`[deep-dive] ${diveId}: querying sensors...`);
  const sensorData: SensorReading[] = [];
  const [usgs, firms] = await Promise.all([
    queryUSGS(title),
    queryFIRMS(title),
  ]);
  if (usgs) sensorData.push(usgs);
  if (firms) sensorData.push(firms);
  console.log(`[deep-dive] ${diveId}: ${sensorData.length} sensor readings`);

  // ── Step 1: Extract claims ──────────────────────────────────────────
  console.log(`[deep-dive] ${diveId}: extracting claims...`);
  const articleText = buildArticleText(title, summary, evidenceExcerpts);
  const claimPrompt = CLAIM_EXTRACTION_PROMPT.replace('{ARTICLE_TEXT}', articleText);
  const claimResponse = await groqChat('llama-3.1-8b-instant', [
    { role: 'user', content: claimPrompt },
  ]);

  let claims: Claim[] = [];
  if (claimResponse.ok) {
    claims = parseLLMJson<Claim[]>(claimResponse.text) ?? [];
  }
  if (!claimResponse.ok || claims.length === 0) {
    failures.push('claim extraction');
    console.warn(`[deep-dive] ${diveId}: claim extraction ${claimResponse.ok ? 'returned no claims' : 'failed'}`);
  }
  console.log(`[deep-dive] ${diveId}: extracted ${claims.length} claims`);

  if (claims.length === 0) {
    const result = buildFallbackResult(title, summary, evidenceExcerpts, sensorData, failures, Date.now() - start);
    await saveResult(sb, diveId, result);
    return result;
  }

  // ── Step 2: Generate research queries ────────────────────────────────
  console.log(`[deep-dive] ${diveId}: generating queries...`);
  const claimsText = claims.map(c => `[${c.id}] ${c.statement}`).join('\n');
  const queryPrompt = QUERY_GENERATION_PROMPT.replace('{CLAIMS_TEXT}', claimsText);
  const queryResponse = await groqChat('llama-3.1-8b-instant', [
    { role: 'user', content: queryPrompt },
  ]);

  let queries: Array<{ claim_id: string; query: string }> = [];
  if (queryResponse.ok) {
    queries = parseLLMJson<Array<{ claim_id: string; query: string }>>(queryResponse.text) ?? [];
  }
  if (!queryResponse.ok || queries.length === 0) {
    failures.push('query generation');
    // Fallback: generate simple queries from the claims themselves
    queries = claims.map(c => ({
      claim_id: c.id,
      query: c.statement.slice(0, 100),
    }));
    console.warn(`[deep-dive] ${diveId}: query generation failed, using claim text as queries`);
  }
  console.log(`[deep-dive] ${diveId}: ${queries.length} queries`);

  // ── Step 3: Web research (Groq Compound) ────────────────────────────
  console.log(`[deep-dive] ${diveId}: researching...`);
  const research: ResearchFinding[] = [];
  let researchFailed = false;

  const queryByClaim = new Map<string, string[]>();
  for (const q of queries) {
    const arr = queryByClaim.get(q.claim_id) ?? [];
    arr.push(q.query);
    queryByClaim.set(q.claim_id, arr);
  }

  for (const [claimId, claimQueries] of queryByClaim) {
    const claim = claims.find(c => c.id === claimId);
    if (!claim) continue;

    const combinedQuery = `I need to verify this claim: "${claim.statement}"

Search for evidence using these queries and report what you find. For each source, provide the URL, title, and a brief excerpt of the relevant information. State whether the evidence supports or contradicts the claim.

Queries to search:
${claimQueries.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

    const result = await groqCompound(combinedQuery);
    if (result.ok) {
      research.push({
        claim_id: claimId,
        query: claimQueries.join(' | '),
        sources: [],
        summary: result.text.slice(0, 1500),
        supports_claim: null,
      });
    } else {
      researchFailed = true;
      research.push({
        claim_id: claimId,
        query: claimQueries.join(' | '),
        sources: [],
        summary: `Web research for this claim could not be completed. The claim "${claim.statement}" requires manual verification through the source links provided in the evidence section above.`,
        supports_claim: null,
      });
    }
  }
  if (researchFailed) failures.push('web research');

  // ── Step 5: Synthesis (Gemini) ──────────────────────────────────────
  console.log(`[deep-dive] ${diveId}: synthesizing...`);
  const synthesisPrompt = SYNTHESIS_PROMPT
    .replace('{CLAIMS_TEXT}', claimsText)
    .replace('{RESEARCH_TEXT}', research.map(r =>
      `[Claim ${r.claim_id}] Query: ${r.query}\nFindings: ${r.summary}`
    ).join('\n\n'))
    .replace('{SENSOR_TEXT}', sensorData.length > 0
      ? sensorData.map(s => `[${s.source}] ${s.summary}`).join('\n')
      : 'No physical sensor data available for this event.');

  const synthesisResponse = await geminiChat(synthesisPrompt);

  let verdicts: ClaimVerdict[];
  let overall: DeepDiveResult['overall_verdict'];
  let summaryText: string;

  if (synthesisResponse.ok) {
    const synthesis = parseLLMJson<{
      verdicts: ClaimVerdict[];
      overall_verdict: string;
      summary: string;
    }>(synthesisResponse.text);

    if (synthesis?.verdicts) {
      verdicts = synthesis.verdicts;
      overall = (synthesis.overall_verdict ?? 'unverified') as DeepDiveResult['overall_verdict'];
      summaryText = synthesis.summary ?? 'Research completed successfully.';
    } else {
      failures.push('synthesis parsing');
      verdicts = buildFallbackVerdicts(claims, research, sensorData);
      overall = deriveFallbackOverall(verdicts);
      summaryText = 'Research was completed but the final synthesis encountered an issue. The claims and evidence below are presented as-is for your review.';
    }
  } else {
    failures.push('synthesis');
    verdicts = buildFallbackVerdicts(claims, research, sensorData);
    overall = deriveFallbackOverall(verdicts);
    summaryText = buildFallbackSynthesisSummary(claims, research, sensorData, failures);
  }

  const result: DeepDiveResult = {
    claims,
    research,
    sensor_data: sensorData,
    verdicts,
    overall_verdict: overall,
    summary: summaryText,
    research_duration_ms: Date.now() - start,
  };

  await saveResult(sb, diveId, result);
  console.log(`[deep-dive] ${diveId}: complete in ${result.research_duration_ms}ms — ${overall} (failures: ${failures.length > 0 ? failures.join(', ') : 'none'})`);
  return result;
}

/**
 * When synthesis AI fails, build verdicts from the raw research data
 * using simple keyword heuristics. Not as good as LLM synthesis, but
 * gives users something useful rather than a blank report.
 */
function buildFallbackVerdicts(
  claims: Claim[],
  research: ResearchFinding[],
  sensorData: SensorReading[],
): ClaimVerdict[] {
  return claims.map(c => {
    const findings = research.filter(r => r.claim_id === c.id);
    const hasResearch = findings.some(f => f.summary.length > 50 && !f.summary.includes('could not be completed'));
    const sensorRelevant = sensorData.find(s => s.confirms_event !== null);

    let verdict: ClaimVerdict['verdict'] = 'unverified';
    let explanation: string;
    let confidence = 0;

    if (hasResearch && sensorRelevant?.confirms_event) {
      verdict = 'partially_supported';
      confidence = 45;
      explanation = 'Web research found relevant coverage and sensor data is available. Full synthesis was unavailable — review the research trail and sensor readings below for details.';
    } else if (hasResearch) {
      verdict = 'unverified';
      confidence = 25;
      explanation = 'Web research found relevant coverage but full analysis could not be completed. Review the research trail below to evaluate this claim.';
    } else {
      verdict = 'unverified';
      confidence = 0;
      explanation = 'Research services were temporarily unavailable. This claim has not been independently verified.';
    }

    return {
      claim_id: c.id,
      statement: c.statement,
      verdict,
      confidence,
      supporting_sources: [],
      contradicting_sources: [],
      sensor_confirmation: sensorRelevant
        ? sensorRelevant.summary
        : null,
      explanation,
    };
  });
}

function deriveFallbackOverall(verdicts: ClaimVerdict[]): DeepDiveResult['overall_verdict'] {
  if (verdicts.some(v => v.verdict === 'partially_supported')) return 'mixed';
  return 'unverified';
}

function buildFallbackSynthesisSummary(
  claims: Claim[],
  research: ResearchFinding[],
  sensorData: SensorReading[],
  failures: string[],
): string {
  const parts: string[] = [];
  parts.push(`${claims.length} claim${claims.length === 1 ? ' was' : 's were'} identified in this report.`);

  const successfulResearch = research.filter(r => !r.summary.includes('could not be completed'));
  if (successfulResearch.length > 0) {
    parts.push(`Web research was completed for ${successfulResearch.length} of ${research.length} queries.`);
  } else if (research.length > 0) {
    parts.push('Web research services were temporarily at capacity.');
  }

  const confirmedSensors = sensorData.filter(s => s.confirms_event === true);
  const unavailableSensors = sensorData.filter(s => s.confirms_event === null);
  if (confirmedSensors.length > 0) {
    parts.push(`Physical sensor data from ${confirmedSensors.map(s => s.source).join(' and ')} is available and shown below.`);
  }
  if (unavailableSensors.length > 0) {
    parts.push(`Some sensor networks could not be reached — this does not indicate absence of physical evidence.`);
  }

  parts.push('The claims and evidence are presented for your independent review.');
  return parts.join(' ');
}

const VALID_VERDICTS = new Set(['corroborated', 'mixed', 'disputed', 'unverified']);

async function saveResult(sb: any, diveId: string, result: DeepDiveResult): Promise<void> {
  // Validate overall_verdict against the DB CHECK constraint
  const safeVerdict = VALID_VERDICTS.has(result.overall_verdict)
    ? result.overall_verdict
    : 'unverified';

  const { error } = await sb.from('deep_dives').update({
    status: 'complete',
    claims: result.claims,
    research: result.research,
    sensor_data: result.sensor_data,
    synthesis: { verdicts: result.verdicts },
    summary: result.summary,
    overall_verdict: safeVerdict,
    completed_at: new Date().toISOString(),
    raw_data: { research_duration_ms: result.research_duration_ms },
  }).eq('id', diveId);

  if (error) {
    console.error(`[deep-dive] saveResult failed for ${diveId}: ${error.message}`);
    // Mark as failed so the row doesn't stay stuck at 'running'
    await sb.from('deep_dives').update({
      status: 'failed',
      raw_data: { error: error.message, research_duration_ms: result.research_duration_ms },
    }).eq('id', diveId);
  }
}

/**
 * Auto-dive: pick the top N signals and process any pending user requests.
 */
export async function autoDeepDive(limit: number = 5): Promise<number> {
  const sb = supabase();

  // Unstick any dives that have been 'running' for over 10 minutes
  // (crashed worker, timeout, etc.)
  await sb.from('deep_dives')
    .update({ status: 'failed', raw_data: { error: 'timed_out' } })
    .eq('status', 'running')
    .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

  // Find recent signals worth diving — severity >= 20 (lowered from 40
  // so more signals get researched), look back 12 hours (extended from 6)
  const { data: candidates } = await sb
    .from('signals')
    .select('id, title, summary, topic, source_count, severity')
    .gte('first_seen_at', new Date(Date.now() - 12 * 3600 * 1000).toISOString())
    .gte('severity', 20)
    .gte('source_count', 1)
    .order('severity', { ascending: false })
    .limit(limit * 3);

  if (!candidates || candidates.length === 0) return 0;

  // Only skip signals that already have a COMPLETED dive
  // (failed/running-stuck dives should be retryable)
  const { data: existingDives } = await sb
    .from('deep_dives')
    .select('signal_id')
    .in('signal_id', candidates.map(c => c.id))
    .eq('status', 'complete');

  const alreadyDived = new Set((existingDives ?? []).map((d: any) => d.signal_id));
  const toDive = candidates.filter(c => !alreadyDived.has(c.id)).slice(0, limit);

  let completed = 0;
  for (const signal of toDive) {
    try {
      const { data: evidence } = await sb
        .from('evidence')
        .select('title, excerpt')
        .eq('signal_id', signal.id)
        .limit(10);

      const excerpts = (evidence ?? [])
        .map((e: any) => `${e.title ?? ''}: ${e.excerpt ?? ''}`.trim())
        .filter(Boolean);

      const { data: dive } = await sb
        .from('deep_dives')
        .insert({
          signal_id: signal.id,
          status: 'pending',
          auto_generated: true,
        })
        .select('id')
        .single();

      if (!dive) continue;

      await runDeepDive(dive.id, signal.title, signal.summary, excerpts, signal.topic);
      completed++;
    } catch (err) {
      console.warn(`[auto-dive] failed for signal ${signal.id}: ${(err as Error).message}`);
    }
  }

  // Also process any user-requested dives (pending, with signal_id or source_url)
  const { data: pendingDives } = await sb
    .from('deep_dives')
    .select('id, signal_id, source_url')
    .eq('status', 'pending')
    .eq('auto_generated', false)
    .order('created_at', { ascending: true })
    .limit(10);

  for (const pending of pendingDives ?? []) {
    try {
      if (pending.signal_id) {
        const { data: signal } = await sb
          .from('signals')
          .select('id, title, summary, topic')
          .eq('id', pending.signal_id)
          .single();
        if (!signal) continue;

        const { data: evidence } = await sb
          .from('evidence')
          .select('title, excerpt')
          .eq('signal_id', signal.id)
          .limit(10);

        const excerpts = (evidence ?? [])
          .map((e: any) => `${e.title ?? ''}: ${e.excerpt ?? ''}`.trim())
          .filter(Boolean);

        await runDeepDive(pending.id, signal.title, signal.summary, excerpts, signal.topic);
        completed++;
      } else if (pending.source_url) {
        const page = await fetchPageContent(pending.source_url);
        await runDeepDive(
          pending.id,
          page?.title || pending.source_url,
          page?.summary || null,
          page?.summary ? [page.summary] : [],
          'other',
        );
        completed++;
      }
    } catch (err) {
      console.warn(`[deep-dive] failed for pending dive ${pending.id}: ${(err as Error).message}`);
    }
  }

  return completed;
}

async function fetchPageContent(url: string): Promise<{ title: string; summary: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Crosscheck-Bot/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || url;

    // Extract meta description or og:description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const description = descMatch?.[1]?.trim() || '';

    // Extract first paragraph as fallback
    let summary = description;
    if (!summary) {
      const pMatch = html.match(/<p[^>]*>([^<]{40,500})<\/p>/i);
      summary = pMatch?.[1]?.trim() || '';
    }

    return { title, summary: summary.slice(0, 1000) };
  } catch {
    return null;
  }
}
