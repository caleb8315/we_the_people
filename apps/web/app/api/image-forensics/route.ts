import { NextResponse } from 'next/server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const HF_MODELS = [
  'Organika/sdxl-detector',
  'umm-maybe/AI-image-detector',
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/image-forensics
 *
 * Accepts an image as binary body, sends it to HuggingFace's free
 * Inference API for AI detection using trained ViT models, and returns
 * the classification results.
 *
 * No HF token needed — the free tier works without auth for popular
 * models. If a token is configured it gets better rate limits.
 */
export async function POST(req: Request) {
  const rl = limit(getClientKey(req, 'img-forensics'), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  let contentType = req.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    contentType = 'image/jpeg';
  }

  let body: ArrayBuffer;
  try {
    body = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ error: 'could not read body' }, { status: 400 });
  }
  if (body.byteLength === 0) {
    return NextResponse.json({ error: 'empty body' }, { status: 400 });
  }
  if (body.byteLength > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: 'image too large (max 10MB)' }, { status: 400 });
  }

  const imageBuffer = Buffer.from(body);
  const hfToken = process.env.HF_API_TOKEN ?? process.env.HUGGINGFACE_API_TOKEN ?? null;

  const results: Array<{
    model: string;
    labels: Array<{ label: string; score: number }>;
    error: string | null;
  }> = [];

  await Promise.all(
    HF_MODELS.map(async (model) => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': contentType,
        };
        if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

        const res = await fetch(
          `https://api-inference.huggingface.co/models/${model}`,
          {
            method: 'POST',
            headers,
            body: imageBuffer,
          },
        );

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          results.push({ model, labels: [], error: `${res.status}: ${errText.slice(0, 200)}` });
          return;
        }

        const data = (await res.json()) as Array<{ label: string; score: number }>;
        results.push({ model, labels: Array.isArray(data) ? data : [], error: null });
      } catch (err) {
        results.push({
          model,
          labels: [],
          error: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }),
  );

  let aiScore = 0;
  let humanScore = 0;
  let modelCount = 0;
  let modelDetails: Array<{ model: string; ai: number; human: number }> = [];

  for (const r of results) {
    if (r.error || r.labels.length === 0) continue;
    const aiLabel = r.labels.find(
      (l) => /artificial|ai|fake|generated/i.test(l.label),
    );
    const humanLabel = r.labels.find(
      (l) => /human|real|natural|authentic/i.test(l.label),
    );
    const ai = aiLabel?.score ?? 0;
    const human = humanLabel?.score ?? 0;
    aiScore += ai;
    humanScore += human;
    modelCount++;
    modelDetails.push({
      model: r.model.split('/').pop() ?? r.model,
      ai: Math.round(ai * 1000) / 1000,
      human: Math.round(human * 1000) / 1000,
    });
  }

  if (modelCount > 0) {
    aiScore /= modelCount;
    humanScore /= modelCount;
  }

  const verdict =
    aiScore > 0.75
      ? 'ai_generated'
      : aiScore > 0.55
        ? 'likely_ai'
        : humanScore > 0.75
          ? 'authentic'
          : humanScore > 0.55
            ? 'likely_authentic'
            : 'uncertain';

  return NextResponse.json({
    verdict,
    ai_score: Math.round(aiScore * 1000) / 1000,
    human_score: Math.round(humanScore * 1000) / 1000,
    model_count: modelCount,
    model_details: modelDetails,
    errors: results.filter((r) => r.error).map((r) => ({ model: r.model, error: r.error })),
  });
}
