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
import { env } from '../lib/env';

// ── LLM Clients ─────────────────────────────────────────────────────────

async function groqChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: Record<string, unknown> = {},
): Promise<string> {
  const { GROQ_API_KEY } = env();
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.1,
    max_tokens: 2000,
    ...options,
  };
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content ?? '';
}

async function groqCompound(query: string): Promise<string> {
  return groqChat('groq/compound-mini', [
    { role: 'user', content: query },
  ]);
}

async function geminiChat(prompt: string): Promise<string> {
  const { GEMINI_API_KEY } = env();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 3000 },
      }),
    },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Live Sensor Queries ─────────────────────────────────────────────────

async function queryUSGS(title: string): Promise<SensorReading | null> {
  const magMatch = title.match(/magnitude\s*([\d.]+)/i) ||
                   title.match(/M\s*([\d.]+)/i) ||
                   title.match(/([\d.]+)\s*magnitude/i);
  const hasQuakeTerms = /earthquake|quake|seismic|tremor|aftershock/i.test(title);
  if (!hasQuakeTerms) return null;

  try {
    const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson';
    const res = await fetch(url, { headers: { 'user-agent': 'Crosscheck-Bot/1.0' } });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const features = data.features ?? [];

    if (features.length === 0) {
      return {
        source: 'USGS Earthquake Hazards Program',
        type: 'seismic',
        data: { earthquakes_today: 0 },
        summary: 'No M4.5+ earthquakes detected by USGS in the last 24 hours.',
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
    return null;
  }
}

async function queryFIRMS(title: string, region?: string): Promise<SensorReading | null> {
  const hasFireTerms = /fire|explosion|strike|airstrike|bombing|blast|burn|thermal/i.test(title);
  const hasConflictRegion = /gaza|israel|ukraine|kyiv|syria|yemen|sudan|sahel/i.test(title);
  if (!hasFireTerms && !hasConflictRegion) return null;

  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) return null;

  let bbox = '-180,-90,180,90';
  if (/gaza|israel/i.test(title)) bbox = '34,31,35,32';
  else if (/ukraine|kyiv/i.test(title)) bbox = '22,44,42,53';
  else if (/syria/i.test(title)) bbox = '35,32,42,37';
  else if (/yemen/i.test(title)) bbox = '42,12,54,19';
  else if (/sudan/i.test(title)) bbox = '21,3,39,23';

  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/VIIRS_NOAA20_NRT/${bbox}/1`;
    const res = await fetch(url, { headers: { 'user-agent': 'Crosscheck-Bot/1.0' } });
    if (!res.ok) return null;
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
        : 'No thermal anomalies detected by NASA FIRMS in the target area in the last 24h.',
      confirms_event: highConfidence > 0,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return null;
  }
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

  await sb.from('deep_dives').update({ status: 'running' }).eq('id', diveId);

  try {
    // ── Step 1: Extract claims ──────────────────────────────────────────
    console.log(`[deep-dive] ${diveId}: extracting claims...`);
    const articleText = buildArticleText(title, summary, evidenceExcerpts);
    const claimPrompt = CLAIM_EXTRACTION_PROMPT.replace('{ARTICLE_TEXT}', articleText);
    const claimResponse = await groqChat('llama-3.1-8b-instant', [
      { role: 'user', content: claimPrompt },
    ]);
    const claims = parseLLMJson<Claim[]>(claimResponse) ?? [];
    console.log(`[deep-dive] ${diveId}: extracted ${claims.length} claims`);

    if (claims.length === 0) {
      const result: DeepDiveResult = {
        claims: [],
        research: [],
        sensor_data: [],
        verdicts: [],
        overall_verdict: 'unverified',
        summary: 'Could not extract verifiable claims from this article.',
        research_duration_ms: Date.now() - start,
      };
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
    const queries = parseLLMJson<Array<{ claim_id: string; query: string }>>(queryResponse) ?? [];
    console.log(`[deep-dive] ${diveId}: generated ${queries.length} queries`);

    // ── Step 3: Web research (Groq Compound) ────────────────────────────
    console.log(`[deep-dive] ${diveId}: researching...`);
    const research: ResearchFinding[] = [];

    // Group queries by claim and batch to save compound calls
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

      try {
        const result = await groqCompound(combinedQuery);
        research.push({
          claim_id: claimId,
          query: claimQueries.join(' | '),
          sources: [], // Compound returns inline citations in text
          summary: result.slice(0, 1500),
          supports_claim: null,
        });
      } catch (err) {
        console.warn(`[deep-dive] ${diveId}: compound failed for ${claimId}: ${(err as Error).message}`);
        research.push({
          claim_id: claimId,
          query: claimQueries.join(' | '),
          sources: [],
          summary: 'Research unavailable — API limit reached.',
          supports_claim: null,
        });
      }
    }

    // ── Step 4: Live sensor queries ─────────────────────────────────────
    console.log(`[deep-dive] ${diveId}: querying sensors...`);
    const sensorData: SensorReading[] = [];

    const [usgs, firms] = await Promise.all([
      queryUSGS(title),
      queryFIRMS(title),
    ]);
    if (usgs) sensorData.push(usgs);
    if (firms) sensorData.push(firms);

    console.log(`[deep-dive] ${diveId}: ${sensorData.length} sensor readings`);

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
    const synthesis = parseLLMJson<{
      verdicts: ClaimVerdict[];
      overall_verdict: string;
      summary: string;
    }>(synthesisResponse);

    const verdicts = synthesis?.verdicts ?? claims.map(c => ({
      claim_id: c.id,
      statement: c.statement,
      verdict: 'unverified' as const,
      confidence: 0,
      supporting_sources: [],
      contradicting_sources: [],
      sensor_confirmation: null,
      explanation: 'Synthesis unavailable.',
    }));

    const overall = (synthesis?.overall_verdict ?? 'unverified') as DeepDiveResult['overall_verdict'];
    const summaryText = synthesis?.summary ?? 'Research complete but synthesis unavailable.';

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
    console.log(`[deep-dive] ${diveId}: complete in ${result.research_duration_ms}ms — ${overall}`);
    return result;
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[deep-dive] ${diveId}: failed — ${msg}`);
    await sb.from('deep_dives').update({
      status: 'failed',
      raw_data: { error: msg },
    }).eq('id', diveId);
    throw err;
  }
}

async function saveResult(sb: any, diveId: string, result: DeepDiveResult): Promise<void> {
  await sb.from('deep_dives').update({
    status: 'complete',
    claims: result.claims,
    research: result.research,
    sensor_data: result.sensor_data,
    synthesis: { verdicts: result.verdicts },
    summary: result.summary,
    overall_verdict: result.overall_verdict,
    completed_at: new Date().toISOString(),
    raw_data: { research_duration_ms: result.research_duration_ms },
  }).eq('id', diveId);
}

/**
 * Auto-dive: pick the top N signals from this ingest run and deep-dive them.
 */
export async function autoDeepDive(limit: number = 3): Promise<number> {
  const sb = supabase();

  // Find recent high-severity signals that haven't been deep-dived yet
  const { data: candidates } = await sb
    .from('signals')
    .select('id, title, summary, topic, source_count, severity')
    .gte('first_seen_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .gte('severity', 40)
    .gte('source_count', 1)
    .order('severity', { ascending: false })
    .limit(limit * 2);

  if (!candidates || candidates.length === 0) return 0;

  // Filter out signals that already have a deep dive
  const { data: existingDives } = await sb
    .from('deep_dives')
    .select('signal_id')
    .in('signal_id', candidates.map(c => c.id));

  const alreadyDived = new Set((existingDives ?? []).map((d: any) => d.signal_id));
  const toDive = candidates.filter(c => !alreadyDived.has(c.id)).slice(0, limit);

  let completed = 0;
  for (const signal of toDive) {
    try {
      // Fetch evidence excerpts for this signal
      const { data: evidence } = await sb
        .from('evidence')
        .select('title, excerpt')
        .eq('signal_id', signal.id)
        .limit(10);

      const excerpts = (evidence ?? [])
        .map((e: any) => `${e.title ?? ''}: ${e.excerpt ?? ''}`.trim())
        .filter(Boolean);

      // Create the deep dive record
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

      await runDeepDive(
        dive.id,
        signal.title,
        signal.summary,
        excerpts,
        signal.topic,
      );
      completed++;
    } catch (err) {
      console.warn(`[auto-dive] failed for signal ${signal.id}: ${(err as Error).message}`);
    }
  }

  return completed;
}
