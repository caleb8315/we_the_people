/**
 * Embedding-based semantic similarity using transformers.js.
 *
 * This module provides a higher-quality similarity score than Jaccard by
 * computing sentence embeddings with all-MiniLM-L6-v2. It runs purely in
 * Node.js via ONNX Runtime (WASM backend) — no Python, no GPU required.
 *
 * Design decisions:
 *   - Lazy singleton: the model is loaded once and reused across all calls.
 *   - Graceful degradation: if loading fails (e.g. in CI or constrained env),
 *     the caller falls back to weighted Jaccard. The module never throws.
 *   - Cosine similarity on normalized mean-pooled embeddings.
 *   - Batch encoding for efficiency during ingest runs.
 *
 * The model (~80MB) is downloaded on first use and cached locally.
 */

let pipelineInstance: any = null;
let loadFailed = false;

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

/**
 * Lazily load the feature-extraction pipeline. Returns null if the
 * transformers.js package is not installed or the model can't load.
 */
async function getPipeline(): Promise<any> {
  if (loadFailed) return null;
  if (pipelineInstance) return pipelineInstance;

  try {
    // Dynamic import — @huggingface/transformers is an optional dependency.
    // The import() call is wrapped in Function() to prevent TypeScript from
    // resolving it at compile time, since the package may not be installed.
    const importFn = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<any>;
    const mod = await importFn('@huggingface/transformers');
    pipelineInstance = await mod.pipeline('feature-extraction', MODEL_ID, {
      dtype: 'fp32',
    });
    return pipelineInstance;
  } catch {
    loadFailed = true;
    return null;
  }
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Encode a single text into an embedding vector.
 * Returns null if the model is unavailable.
 */
export async function encodeText(text: string): Promise<Float32Array | null> {
  const pipe = await getPipeline();
  if (!pipe) return null;

  try {
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return output.data as Float32Array;
  } catch {
    return null;
  }
}

/**
 * Encode a batch of texts into embedding vectors.
 * Returns null if the model is unavailable.
 */
export async function encodeBatch(texts: string[]): Promise<Float32Array[] | null> {
  if (texts.length === 0) return [];
  const pipe = await getPipeline();
  if (!pipe) return null;

  try {
    const output = await pipe(texts, { pooling: 'mean', normalize: true });
    const dim = output.dims[1]!;
    const results: Float32Array[] = [];
    for (let i = 0; i < texts.length; i++) {
      results.push(output.data.slice(i * dim, (i + 1) * dim) as Float32Array);
    }
    return results;
  } catch {
    return null;
  }
}

/**
 * Compute semantic similarity between two titles using embeddings.
 * Returns null if the model is unavailable (caller should fall back
 * to weighted Jaccard).
 */
export async function embeddingSimilarity(
  titleA: string,
  titleB: string,
): Promise<number | null> {
  const [embA, embB] = await Promise.all([
    encodeText(titleA),
    encodeText(titleB),
  ]);
  if (!embA || !embB) return null;
  return cosineSimilarity(embA, embB);
}

/**
 * Compute pairwise similarity matrix for a list of titles.
 * Returns null if model unavailable.
 */
export async function batchSimilarity(
  titles: string[],
): Promise<Float32Array[] | null> {
  const embeddings = await encodeBatch(titles);
  if (!embeddings) return null;
  return embeddings;
}

/**
 * Whether the embedding model is available.
 * Useful for deciding whether to use embedding-based or Jaccard matching.
 */
export async function isEmbeddingAvailable(): Promise<boolean> {
  const pipe = await getPipeline();
  return pipe !== null;
}

export { cosineSimilarity };
