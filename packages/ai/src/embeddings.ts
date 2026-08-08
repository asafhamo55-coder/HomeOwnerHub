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

// HuggingFace's free Inference Provider tier rotates which models are
// hosted. As of 2026-05 BAAI/bge-m3 (our originally-spec'd model) is
// NOT on the free tier; BAAI/bge-base-en-v1.5 IS. The schema column
// is sized vector(768) to match. Phase 2.1 brings BGE-M3 back via
// self-hosting (migration 0005c will resize back to vector(1024) at
// that time).
//
// To check which models are currently on the free tier, see:
// https://huggingface.co/hf-inference (look at the deployed-models list).
// OpenAI's embeddings endpoint, reached after HuggingFace's free
// hf-inference provider stopped serving sentence-transformer models. Both
// BAAI/bge-base-en-v1.5 and sentence-transformers/all-mpnet-base-v2 answer
// 400 {"error":"Model not supported by provider hf-inference"}, and the
// legacy api-inference host returns nothing at all, so no further model
// substitution was going to work.
//
// text-embedding-3-small is natively 1536-dimensional and supports
// Matryoshka truncation via the `dimensions` parameter. We request 768
// because inbox_reply_embeddings.embedding is vector(768) and EXPECTED_DIM
// asserts it — a different size would fail loudly here rather than write
// vectors that could never be compared against the ones already stored.
//
// The URL is overridable so any OpenAI-compatible embeddings endpoint
// (Azure OpenAI, a proxy, a self-hosted server) can be swapped in without
// touching this file.
const DEFAULT_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings'
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

const EXPECTED_DIM = 768

const DEFAULT_BATCH_SIZE = 32
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000

/**
 * Hard ceiling on a single embedding request.
 *
 * There was none, and that is why the reply corpus stayed empty in
 * production for days. An unbounded fetch — combined with
 * `wait_for_model`, which asks the provider to HOLD the connection open
 * while a cold model loads — outlives the serverless function itself. The
 * platform kills the invocation, `fetch` rejects with no HTTP response,
 * and the failure surfaces as a bare transport error (`status=none`)
 * carrying no clue about its own cause.
 *
 * Bounded, the same failure becomes a fast, legible timeout that the next
 * scheduled run retries — by which point a cold model is usually warm.
 */
const REQUEST_TIMEOUT_MS = 20_000

export interface EmbedOptions {
  /** Override the embedding endpoint (use for self-hosted swap). */
  baseUrl?: string
  /** Override the auth token (defaults to HUGGINGFACE_API_TOKEN). */
  apiToken?: string
  /** Inputs per request. HF default sweet spot is 16-32. */
  batchSize?: number
  /** Wait for cold-loaded model on HF (first call after idle). */
  /**
   * @deprecated No longer sent. The router.huggingface.co Inference-Providers
   * endpoint rejects the legacy `options` object with 400, so this cannot be
   * forwarded. Kept so existing callers still compile; it has no effect.
   * A cold model now answers immediately and the caller's retry handles it.
   */
  waitForModel?: boolean
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    /**
     * HTTP status code from the provider response, when this error came
     * from a non-OK HTTP response. Undefined for network/transport
     * failures (DNS, timeout, connection reset) and for errors raised
     * before any request was made (e.g. missing token).
     *
     * A status code is a small integer from a fixed, well-known set — it
     * cannot contain resident data, unlike the message string (see the
     * `body.slice(0, 200)` above), so callers that must not log the raw
     * message are free to log/rethrow this field.
     */
    public readonly status?: number,
    /**
     * True when this failure is a network/transport error (fetch itself
     * rejected — DNS, timeout, connection reset) rather than an HTTP
     * response from the provider. Also shape-safe: a boolean, never
     * derived from response content.
     */
    public readonly isNetworkError?: boolean,
    /**
     * True when retrying cannot change the outcome: the provider answered
     * successfully and the answer itself was wrong — wrong count, wrong
     * dimension, unparseable shape.
     *
     * Kept separate from `status` because these failures carry no HTTP
     * status: the request succeeded. Without this flag they fell into the
     * retry path, so a model returning 1536 dimensions against a
     * vector(768) column paid for the same wrong answer three times and
     * then reported "failed after 3 attempts" instead of naming the
     * mismatch.
     */
    public readonly deterministic?: boolean,
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

  // `||`, not `??`. An env var that exists but is EMPTY is the common case
  // here — a dashboard row someone created and never filled, or a value
  // cleared during a rotation — and `??` only falls back on null/undefined,
  // so an empty string sails straight through and becomes the base URL.
  //
  // That is not hypothetical. EMBEDDING_BASE_URL was set to '' in
  // production, so every request went to fetch(''), which throws
  // ERR_INVALID_URL. Wrapped twice by the retry layer, it surfaced as a
  // bare transport failure with no status, and the reply corpus sat empty
  // for days while the token, the model and the endpoint were all fine.
  // The same shape had already broken Inngest in this codebase, via an
  // INNGEST_EVENT_KEY that was present but blank.
  //
  // Trimmed as well: a value that is only whitespace is not a URL either.
  const baseUrl =
    opts.baseUrl?.trim() || process.env.EMBEDDING_BASE_URL?.trim() || DEFAULT_EMBEDDING_URL
  const model = process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL
  const apiToken = opts.apiToken?.trim() || process.env.OPENAI_API_KEY?.trim()
  if (!apiToken) {
    throw new EmbeddingError(
      'OPENAI_API_KEY is not set. Configure it in env or pass apiToken explicitly.',
    )
  }

  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE
  const out: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const embeddings = await embedBatchWithRetry(batch, {
      baseUrl,
      apiToken,
      model,
      // Default FALSE, deliberately. `wait_for_model: true` asks the
      // provider to hold the connection open until a cold model finishes
      // loading, which is the right trade for an interactive request a
      // human is waiting on, and the wrong one for a background job with a
      // hard platform ceiling: the whole batch dies instead of the caller
      // learning anything. With it off, a cold model answers 503
      // immediately — a legible status the job logs and the next run
      // retries against a warmed model.
      waitForModel: opts.waitForModel ?? false,
    })
    out.push(...embeddings)
  }

  return out
}

interface BatchOpts {
  baseUrl: string
  apiToken: string
  model: string
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

      // Non-retryable, by STATUS where we have one rather than by
      // substring: a body echoed into the message could contain "400" and
      // wrongly suppress a retry, or omit it and wrongly cause three.
      if (err instanceof EmbeddingError && (err.status === 400 || err.status === 401 || err.status === 403)) {
        throw err
      }

      // Non-retryable, deterministic: the provider answered successfully
      // and the answer was the wrong shape or the wrong dimension. Retrying
      // pays for the same wrong answer twice more and delays a failure that
      // cannot resolve itself. This is how a model returning 1536 dims
      // against a vector(768) column should surface — immediately, naming
      // the mismatch, not as "failed after 3 attempts".
      if (err instanceof EmbeddingError && err.deterministic) {
        throw err
      }
      // Backoff and retry on 429 / 503 / network errors.
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt
      await sleep(backoff)
    }
  }

  // Carry the last underlying failure's status/isNetworkError forward.
  // Without this, a retried-then-exhausted failure (e.g. 404 from a
  // retired model, or repeated network errors) loses its diagnostic shape
  // at exactly the point a caller like mailboxReplyEmbeddingsJob reads it.
  const lastStatus = lastError instanceof EmbeddingError ? lastError.status : undefined
  const lastIsNetworkError =
    lastError instanceof EmbeddingError ? lastError.isNetworkError : undefined
  throw new EmbeddingError(
    `Embedding failed after ${MAX_RETRIES} attempts`,
    lastError,
    lastStatus,
    lastIsNetworkError,
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
      // OpenAI embeddings shape. `dimensions` truncates the native 1536
      // down to the 768 the schema stores; omitting it would produce
      // vectors that fail EXPECTED_DIM below.
      body: JSON.stringify({
        input: batch,
        model: opts.model,
        dimensions: EXPECTED_DIM,
      }),
      // Without this the request can outlive the function that made it.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (networkErr) {
    throw new EmbeddingError(
      'Network error reaching embedding endpoint',
      networkErr,
      undefined,
      true,
    )
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new EmbeddingError(
      `Embedding request failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`,
      undefined,
      res.status,
      false,
    )
  }

  const json = (await res.json()) as unknown
  const vectors = normalizeResponse(json, batch.length)

  if (vectors.length !== batch.length) {
    throw new EmbeddingError(
      `Expected ${batch.length} embeddings, got ${vectors.length}`,
      undefined,
      undefined,
      undefined,
      true,
    )
  }

  for (const v of vectors) {
    if (v.length !== EXPECTED_DIM) {
      throw new EmbeddingError(
        `Expected ${EXPECTED_DIM}-dim vectors, got ${v.length}. Model mismatch?`,
        undefined,
        undefined,
        undefined,
        true,
      )
    }
  }

  return vectors
}

/**
 * Accepts the OpenAI envelope plus the shapes older/self-hosted servers
 * return, so swapping EMBEDDING_BASE_URL to a compatible endpoint does not
 * require editing this file.
 *
 * OpenAI returns `{ data: [{ index, embedding }, ...] }` and does NOT
 * guarantee `data` is ordered by index. The caller pairs vectors back to
 * messages positionally, so an out-of-order response would attach each
 * reply's embedding to the wrong message — a silent corruption that no
 * test with a single input could ever catch. Hence the explicit sort.
 */
function normalizeResponse(json: unknown, expectedCount: number): number[][] {
  if (
    typeof json === 'object' &&
    json !== null &&
    'data' in json &&
    Array.isArray((json as { data: unknown }).data)
  ) {
    const rows = (json as { data: Array<{ index?: number; embedding?: unknown }> }).data
    const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    const vectors = ordered.map((r) => r.embedding)
    if (vectors.every((v) => Array.isArray(v) && v.every((n) => typeof n === 'number'))) {
      return vectors as number[][]
    }
  }

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
    undefined,
    undefined,
    undefined,
    true,
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
