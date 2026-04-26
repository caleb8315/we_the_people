/**
 * Image forensics — detects AI-generated and manipulated images.
 *
 * Architecture:
 *   1. Server-side: sends image to professional AI detection services
 *      (SightEngine primary, HuggingFace fallback) via /api/image-forensics.
 *      These are trained neural networks — same tech real detection companies use.
 *   2. Client-side: extracts EXIF metadata (camera, software, GPS, dates).
 *   3. Combines both into a clear verdict with percentage confidence.
 *
 * The AI model is always the dominant signal. Metadata is supporting evidence.
 * If API fails, metadata alone still gives useful results.
 */

export interface ForensicFinding {
  text: string;
  type: 'good' | 'bad' | 'neutral';
}

export interface ForensicReport {
  verdict: 'ai' | 'real' | 'uncertain';
  verdict_label: string;
  confidence: number;
  explanation: string;
  findings: ForensicFinding[];
  ai_score: number | null;
  source: string | null;
  generator_scores: Record<string, number> | null;
  metadata: {
    camera: string | null;
    software: string | null;
    date: string | null;
    has_gps: boolean;
    has_exif: boolean;
  };
}

export async function analyzeImage(file: File): Promise<ForensicReport> {
  // Run AI detection API and metadata extraction in parallel
  const [apiResult, metadata] = await Promise.all([
    callDetectionApi(file),
    extractMetadata(file),
  ]);

  return buildReport(apiResult, metadata);
}

// ── API CALL ────────────────────────────────────────────────────────────

interface ApiResult {
  ok: boolean;
  source: string;
  ai_score: number;
  human_score: number;
  details: Record<string, number> | null;
  error: string | null;
}

async function callDetectionApi(file: File): Promise<ApiResult | null> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 40_000);

    const res = await fetch('/api/image-forensics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image_base64: base64 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json() as ApiResult;
    return data.ok ? data : null;
  } catch {
    return null;
  }
}

// ── METADATA ────────────────────────────────────────────────────────────

type Metadata = ForensicReport['metadata'];

async function extractMetadata(file: File): Promise<Metadata> {
  const result: Metadata = { camera: null, software: null, date: null, has_gps: false, has_exif: false };
  try {
    const exifr = await import('exifr');
    const data = await exifr.default.parse(file, true);
    if (!data) return result;
    result.has_exif = true;
    if (data.Make || data.Model) result.camera = [data.Make, data.Model].filter(Boolean).join(' ');
    result.software = data.Software ?? data.Creator ?? data.CreatorTool ?? null;
    if (data.DateTimeOriginal) {
      const d = data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal : new Date(data.DateTimeOriginal);
      result.date = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    }
    if (data.latitude != null && data.longitude != null) result.has_gps = true;
  } catch { /* no metadata */ }
  return result;
}

// ── BUILD REPORT ────────────────────────────────────────────────────────

const AI_TOOLS = ['dall-e', 'openai', 'midjourney', 'stable diffusion', 'firefly', 'imagen', 'comfyui', 'flux', 'ideogram'];

function buildReport(api: ApiResult | null, meta: Metadata): ForensicReport {
  const findings: ForensicFinding[] = [];
  let verdict: ForensicReport['verdict'] = 'uncertain';
  let confidence = 0;
  let explanation = '';
  let aiScore: number | null = null;
  let source: string | null = null;
  let generatorScores: Record<string, number> | null = null;

  // Check for AI tool in metadata first (strongest possible evidence)
  if (meta.software) {
    const sw = meta.software.toLowerCase();
    const matchedTool = AI_TOOLS.find(t => sw.includes(t));
    if (matchedTool) {
      verdict = 'ai';
      confidence = 99;
      explanation = `This image was created with "${meta.software}" — a known AI image generation tool. This is embedded directly in the file metadata and is definitive proof of AI generation.`;
      findings.push({ text: `Created with AI tool: ${meta.software}`, type: 'bad' });
      return { verdict, verdict_label: 'AI-generated image', confidence, explanation, findings, ai_score: 1, source: 'metadata', generator_scores: null, metadata: meta };
    }
  }

  // AI detection model results
  if (api) {
    aiScore = api.ai_score;
    source = api.source;
    generatorScores = api.details;
    const pct = Math.round(api.ai_score * 100);
    const humanPct = Math.round(api.human_score * 100);

    // Find top generator if SightEngine
    let topGenerator: string | null = null;
    if (api.details) {
      let topScore = 0;
      for (const [gen, score] of Object.entries(api.details)) {
        if (score > topScore && score > 0.1) { topGenerator = gen; topScore = score; }
      }
    }

    if (api.ai_score >= 0.80) {
      verdict = 'ai';
      confidence = pct;
      const genNote = topGenerator ? ` The image most closely matches output from ${formatGeneratorName(topGenerator)}.` : '';
      explanation = `Our AI detection system is ${pct}% confident this image was generated by AI.${genNote} This analysis is powered by neural networks trained on millions of real and AI-generated images — the same technology used by professional fact-checkers and content moderators.`;
      findings.push({ text: `AI detection: ${pct}% confidence this is AI-generated`, type: 'bad' });
      if (topGenerator) findings.push({ text: `Most likely generator: ${formatGeneratorName(topGenerator)}`, type: 'bad' });
    } else if (api.ai_score >= 0.55) {
      verdict = 'ai';
      confidence = pct;
      explanation = `Our AI detection system gives this a ${pct}% probability of being AI-generated. The image has characteristics that trained models associate with synthetic content.`;
      findings.push({ text: `AI detection: ${pct}% likely AI-generated`, type: 'bad' });
    } else if (api.human_score >= 0.80) {
      verdict = 'real';
      confidence = humanPct;
      explanation = `Our AI detection system is ${humanPct}% confident this is a real photograph — not generated by AI. The image has the pixel-level characteristics of genuine camera-captured content.`;
      findings.push({ text: `AI detection: ${humanPct}% confidence this is real`, type: 'good' });
    } else if (api.human_score >= 0.55) {
      verdict = 'real';
      confidence = humanPct;
      explanation = `Our AI detection system gives this a ${humanPct}% probability of being a real photograph. It leans toward authentic content.`;
      findings.push({ text: `AI detection: ${humanPct}% likely a real photo`, type: 'good' });
    } else {
      confidence = 50;
      explanation = `Our AI detection system returned a close result: ${pct}% AI vs ${humanPct}% real. The image has characteristics of both AI-generated and real content.`;
      findings.push({ text: `AI detection: ${pct}% AI / ${humanPct}% real — close call`, type: 'neutral' });
    }

    if (api.source === 'sightengine') {
      findings.push({ text: 'Analysis by SightEngine — professional-grade AI detection used by newsrooms and platforms', type: 'neutral' });
    }
  } else {
    findings.push({ text: 'AI detection model unavailable — analysis based on metadata only', type: 'neutral' });
  }

  // Metadata findings
  if (meta.camera) {
    findings.push({ text: `Camera identified: ${meta.camera}. Real photos carry this data; AI images almost never do.`, type: 'good' });
    if (verdict === 'uncertain') { verdict = 'real'; confidence = Math.max(confidence, 70); explanation = `The image has camera metadata from ${meta.camera}, which is strong evidence of a real photograph. AI-generated images almost never carry genuine camera data.`; }
  } else if (!meta.has_exif) {
    findings.push({ text: 'No metadata found. Real camera photos almost always have EXIF data — its absence is a warning sign.', type: 'bad' });
    if (verdict === 'uncertain') { verdict = 'ai'; confidence = Math.max(confidence, 55); explanation = 'This image has no camera metadata at all. Real photos from phones and cameras almost always carry EXIF data. Combined with the absence of other authenticity indicators, this image should be treated with skepticism.'; }
  } else {
    findings.push({ text: 'Some metadata present but no camera make/model — typical of screenshots or processed images.', type: 'neutral' });
  }

  if (meta.has_gps) {
    findings.push({ text: 'GPS location embedded — social media and AI tools strip this. Strong indicator of an original camera photo.', type: 'good' });
  }

  if (meta.date) {
    findings.push({ text: `Date/time: ${meta.date}`, type: 'neutral' });
  }

  if (meta.software && !AI_TOOLS.some(t => meta.software!.toLowerCase().includes(t))) {
    findings.push({ text: `Software: ${meta.software}`, type: 'neutral' });
  }

  // Generate label
  const verdict_label =
    verdict === 'ai'
      ? confidence >= 75 ? 'AI-generated image' : 'Probably AI-generated'
      : verdict === 'real'
        ? confidence >= 75 ? 'Real photograph' : 'Probably a real photo'
        : 'Uncertain — could not determine';

  return { verdict, verdict_label, confidence, explanation, findings, ai_score: aiScore, source, generator_scores: generatorScores, metadata: meta };
}

function formatGeneratorName(gen: string): string {
  const names: Record<string, string> = {
    dalle: 'DALL-E (OpenAI)', gpt: 'GPT Image (OpenAI)', midjourney: 'Midjourney',
    stable_diffusion: 'Stable Diffusion', firefly: 'Adobe Firefly', flux: 'Flux',
    imagen: 'Imagen (Google)', ideogram: 'Ideogram', gan: 'GAN (StyleGAN)',
    kling: 'Kling', recraft: 'Recraft', reve: 'Reve', seedream: 'Seedream (ByteDance)',
    qwen: 'Qwen (Alibaba)', higgsfield: 'Higgsfield', other: 'other/unknown generator',
  };
  return names[gen] ?? gen;
}
