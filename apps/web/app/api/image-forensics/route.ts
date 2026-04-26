import { NextResponse } from 'next/server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

const HF_MODEL = 'umm-maybe/AI-image-detector';
const MAX_SIZE = 10 * 1024 * 1024;

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
  if (imageBytes.length === 0) {
    return NextResponse.json({ error: 'empty image' }, { status: 400 });
  }
  if (imageBytes.length > MAX_SIZE) {
    return NextResponse.json({ error: 'image too large' }, { status: 400 });
  }

  const hfToken = process.env.HF_API_TOKEN ?? process.env.HUGGINGFACE_API_TOKEN ?? null;

  const result = await callHuggingFace(HF_MODEL, imageBytes, hfToken);

  return NextResponse.json(result);
}

async function callHuggingFace(
  model: string,
  imageBytes: Buffer,
  token: string | null,
  retries = 3,
): Promise<{
  ok: boolean;
  labels: Array<{ label: string; score: number }>;
  error: string | null;
}> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        { method: 'POST', headers, body: new Uint8Array(imageBytes) },
      );

      if (res.status === 503) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        const wait = typeof body.estimated_time === 'number' ? Math.min(body.estimated_time, 30) : 10;
        await sleep(wait * 1000);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, labels: [], error: `HF ${res.status}: ${text.slice(0, 200)}` };
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        return { ok: false, labels: [], error: 'unexpected response format' };
      }

      return { ok: true, labels: data as Array<{ label: string; score: number }>, error: null };
    } catch (err) {
      if (attempt === retries - 1) {
        return { ok: false, labels: [], error: err instanceof Error ? err.message : 'unknown' };
      }
      await sleep(3000);
    }
  }

  return { ok: false, labels: [], error: 'max retries exceeded' };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
