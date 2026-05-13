/**
 * BGE-M3 embedding client (Phase 2.0 bridge per ADR-003).
 *
 * Default backend is HuggingFace Inference for `BAAI/bge-m3` — set
 * HUGGINGFACE_API_TOKEN. Override the host via EMBEDDING_BASE_URL when
 * we cut over to self-hosted in Phase 2.1.
 *
 * Returns 1024-dim vectors matching the schema column `vector(1024)`.
 *
 * Batches transparently — HuggingFace accepts up to 96 inputs per call;
 * we split larger lists into chunks to stay well under that and to keep
 * payload sizes manageable.
 */

// HuggingFace fully migrated to Inference Providers (router.huggingface.co)
// in 2026 — the old api-inference.huggingface.co subdomain returns 404 on
// every model path. The router pattern is:
//   https://router.huggingface.co/<provider>/<route>
// For HF-native inference (free-tier-eligible), provider = hf-inference.
//
// If this also 404s for a given model, that model isn't on the free
// inference tier. Fix: either set EMBEDDING_BASE_URL to a self-hosted
// endpoint (Phase 2.1) or skip embeddings entirely — the W1 retrieval
// path falls back to Postgres FTS via the search_governing_chunks RPC.
const DEFAULT_HF_URL =
  'https://router.huggingface.co/hf-inference/pipeline/feature-extraction/BAAI/bge-m3'

const DEFAULT_BATCH_SIZE = 32
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000

export interface EmbedOptions {
  /** Override the embedding endpoint (use for self-hosted swap). */
  baseUrl?: string
  /** Override the auth token (defaults to HUGGINGFACE_API_TOKEN). */
  apiToken?: string
  /** Inputs per request. HF default sweet spot is 16-32. */
  batchSize?: number
  /** Wait for cold-loaded model on HF (first call after idle). */
  waitForModel?: boolean
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'EmbeddingError'
  }
}

/**
 * Embed `texts`. Returns one Float-array per input, in the same order.
 * Throws `EmbeddingError` on retryable failures that exhausted retries
 * or on non-retryable failures (auth, malformed input).
 */
export async function embedTexts(
  texts: string[],
  opts: EmbedOptions = {},
): Promise<number[][]> {
  if (texts.length === 0) return []

  const baseUrl = opts.baseUrl ?? process.env.EMBEDDING_BASE_URL ?? DEFAULT_HF_URL
  const apiToken = opts.apiToken ?? process.env.HUGGINGFACE_API_TOKEN
  if (!apiToken) {
    throw new EmbeddingError(
      'HUGGINGFACE_API_TOKEN is not set. Configure it in env or pass apiToken explicitly.',
    )
  }

  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE
  const out: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const embeddings = await embedBatchWithRetry(batch, {
      baseUrl,
      apiToken,
      waitForModel: opts.waitForModel ?? true,
    })
    out.push(...embeddings)
  }

  return out
}

interface BatchOpts {
  baseUrl: string
  apiToken: string
  waitForModel: boolean
}

async function embedBatchWithRetry(
  batch: string[],
  opts: BatchOpts,
): Promise<number[][]> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await embedBatch(batch, opts)
    } catch (err) {
      lastError = err
      // Non-retryable: auth, bad request, malformed input.
      if (err instanceof EmbeddingError && err.message.includes('401')) {
        throw err
      }
      if (err instanceof EmbeddingError && err.message.includes('400')) {
        throw err
      }
      // Backoff and retry on 429 / 503 / network errors.
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt
      await sleep(backoff)
    }
  }

  throw new EmbeddingError(
    `Embedding failed after ${MAX_RETRIES} attempts`,
    lastError,
  )
}

async function embedBatch(
  batch: string[],
  opts: BatchOpts,
): Promise<number[][]> {
  let res: Response
  try {
    res = await fetch(opts.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: batch,
        options: { wait_for_model: opts.waitForModel },
      }),
    })
  } catch (networkErr) {
    throw new EmbeddingError('Network error reaching embedding endpoint', networkErr)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new EmbeddingError(
      `Embedding request failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`,
    )
  }

  const json = (await res.json()) as unknown
  const vectors = normalizeResponse(json, batch.length)

  if (vectors.length !== batch.length) {
    throw new EmbeddingError(
      `Expected ${batch.length} embeddings, got ${vectors.length}`,
    )
  }

  for (const v of vectors) {
    if (v.length !== 1024) {
      throw new EmbeddingError(
        `Expected 1024-dim vectors, got ${v.length}. Model mismatch?`,
      )
    }
  }

  return vectors
}

/**
 * HuggingFace returns shape `number[][]` for batched feature-extraction
 * with BGE-M3. Some self-hosted servers wrap it differently — accept the
 * canonical shape, with a fallback for `{ embeddings: ... }` envelopes.
 */
function normalizeResponse(json: unknown, expectedCount: number): number[][] {
  if (Array.isArray(json) && json.every((v) => Array.isArray(v))) {
    return json as number[][]
  }
  // Some servers wrap.
  if (typeof json === 'object' && json !== null && 'embeddings' in json) {
    const inner = (json as { embeddings: unknown }).embeddings
    if (Array.isArray(inner) && inner.every((v) => Array.isArray(v))) {
      return inner as number[][]
    }
  }
  // Single-input call may return number[] instead of number[][].
  if (
    expectedCount === 1 &&
    Array.isArray(json) &&
    json.every((v) => typeof v === 'number')
  ) {
    return [json as number[]]
  }
  throw new EmbeddingError(
    `Unexpected embedding response shape: ${JSON.stringify(json).slice(0, 200)}`,
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Format a JS number[] embedding as a Postgres vector literal so it can
 * be passed to an .insert() / .update() without an extra cast. Format:
 * "[0.1,0.2,...]" (Postgres's pgvector text input format).
 */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
