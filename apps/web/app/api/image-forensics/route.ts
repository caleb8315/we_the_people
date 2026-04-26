import { NextResponse } from 'next/server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_SIZE = 10 * 1024 * 1024;

/**
 * POST /api/image-forensics
 *
 * Accepts { image_base64: string } and runs AI detection through
 * multiple services in priority order:
 *
 *   1. SightEngine (primary) — industry-grade, trained on millions of
 *      images, detects all major generators, works on screenshots.
 *      Free tier: 2,000 ops/month forever.
 *      Requires: SIGHTENGINE_API_USER + SIGHTENGINE_API_SECRET
 *
 *   2. HuggingFace (fallback) — open-source ViT model.
 *      Free tier: limited requests.
 *      Optional: HF_API_TOKEN for better rate limits.
 *
 * Returns a normalized result regardless of which service responded.
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'img-forensics'), 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  let body: { image_base64: string } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body?.image_base64) {
    return NextResponse.json({ error: 'missing image_base64' }, { status: 400 });
  }

  const imageBytes = Buffer.from(body.image_base64, 'base64');
  if (imageBytes.length < 100) {
    return NextResponse.json({ error: 'image too small' }, { status: 400 });
  }
  if (imageBytes.length > MAX_SIZE) {
    return NextResponse.json({ error: 'image too large (max 10MB)' }, { status: 400 });
  }

  // Try SightEngine first (best quality), fall back to HuggingFace
  const sightengineUser = process.env.SIGHTENGINE_API_USER;
  const sightengineSecret = process.env.SIGHTENGINE_API_SECRET;

  if (sightengineUser && sightengineSecret) {
    const result = await callSightEngine(imageBytes, sightengineUser, sightengineSecret);
    if (result) return NextResponse.json(result);
  }

  const hfToken = process.env.HF_API_TOKEN ?? process.env.HUGGINGFACE_API_TOKEN ?? null;
  const hfResult = await callHuggingFace(imageBytes, hfToken);
  if (hfResult) return NextResponse.json(hfResult);

  return NextResponse.json({
    ok: false,
    error: 'All detection services unavailable. Configure SIGHTENGINE_API_USER + SIGHTENGINE_API_SECRET or HF_API_TOKEN.',
    source: 'none',
    ai_score: 0,
    human_score: 0,
    details: null,
  });
}

// ── SightEngine ─────────────────────────────────────────────────────────

interface SightEngineResult {
  ok: boolean;
  source: 'sightengine';
  ai_score: number;
  human_score: number;
  details: Record<string, number> | null;
  error: string | null;
}

async function callSightEngine(
  imageBytes: Buffer,
  apiUser: string,
  apiSecret: string,
): Promise<SightEngineResult | null> {
  try {
    const formData = new FormData();
    formData.append('media', new Blob([new Uint8Array(imageBytes)], { type: 'image/jpeg' }), 'image.jpg');
    formData.append('models', 'genai');
    formData.append('api_user', apiUser);
    formData.append('api_secret', apiSecret);

    const res = await fetch('https://api.sightengine.com/1.0/check.json', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      console.warn('[forensics] SightEngine HTTP', res.status);
      return null;
    }

    const data = await res.json() as {
      status: string;
      type?: {
        ai_generated?: number;
        ai_generators?: Record<string, number>;
      };
    };

    if (data.status !== 'success' || !data.type) {
      console.warn('[forensics] SightEngine response:', JSON.stringify(data).slice(0, 300));
      return null;
    }

    const aiScore = data.type.ai_generated ?? 0;
    return {
      ok: true,
      source: 'sightengine',
      ai_score: aiScore,
      human_score: 1 - aiScore,
      details: data.type.ai_generators ?? null,
      error: null,
    };
  } catch (err) {
    console.warn('[forensics] SightEngine error:', err);
    return null;
  }
}

// ── HuggingFace ─────────────────────────────────────────────────────────

interface HuggingFaceResult {
  ok: boolean;
  source: 'huggingface';
  ai_score: number;
  human_score: number;
  details: null;
  error: string | null;
}

async function callHuggingFace(
  imageBytes: Buffer,
  token: string | null,
): Promise<HuggingFaceResult | null> {
  const model = 'umm-maybe/AI-image-detector';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers,
        body: new Uint8Array(imageBytes),
      });

      if (res.status === 503) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        const wait = typeof body.estimated_time === 'number' ? Math.min(body.estimated_time, 20) : 8;
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }

      if (!res.ok) return null;

      const data = await res.json();
      if (!Array.isArray(data)) return null;

      let aiScore = 0;
      let humanScore = 0;
      for (const l of data as Array<{ label: string; score: number }>) {
        const name = l.label.toLowerCase();
        if (name.includes('artificial') || name.includes('ai') || name.includes('fake')) {
          aiScore = Math.max(aiScore, l.score);
        }
        if (name.includes('human') || name.includes('real') || name.includes('natural')) {
          humanScore = Math.max(humanScore, l.score);
        }
      }

      return { ok: true, source: 'huggingface', ai_score: aiScore, human_score: humanScore, details: null, error: null };
    } catch {
      if (attempt === 2) return null;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return null;
}
