import { describe, it, expect, vi, afterEach } from 'vitest'
import { embedTexts, EmbeddingError } from './embeddings'

/**
 * `embedTexts` retries 429/503/network failures (see MAX_RETRIES /
 * INITIAL_BACKOFF_MS in embeddings.ts) and only 401/400 short-circuit
 * immediately. To keep these tests fast and deterministic, every non-OK
 * response below uses a status that short-circuits (401) except where a
 * test is specifically about a status that retries (404 does NOT retry
 * either — retry is hardcoded to 429/503/network only via backoff, but the
 * loop still burns MAX_RETRIES attempts for any non-401/400 error). So
 * non-401/400 cases here fake the timer to avoid a slow real sleep.
 */

function jsonResponse(status: number, statusText: string, body: unknown) {
  return {
    ok: false,
    status,
    statusText,
    text: async () => JSON.stringify(body),
  } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('embedTexts / EmbeddingError status propagation', () => {
  it('carries the HTTP status on a non-OK response (401, non-retryable — no fake timers needed)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, 'Unauthorized', { error: 'invalid credentials for resident@example.com' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    let caught: unknown
    try {
      await embedTexts(['hello world, this text is long enough to pass MIN length checks'], {
        apiToken: 'test-token',
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(EmbeddingError)
    const err = caught as EmbeddingError
    expect(err.status).toBe(401)
    // The message is allowed to contain the raw body fragment (that's the
    // sanitisation the CALLER is responsible for, not this module) — but
    // the status must be independently readable off the error object.
    expect(err.message).toContain('401')
  })

  it('carries 404 on a non-OK response (model/endpoint retired) after exhausting retries', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () =>
      jsonResponse(404, 'Not Found', { error: 'Model BAAI/bge-base-en-v1.5 does not exist' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    let caught: unknown
    const promise = embedTexts(['some resident correspondence body text goes here'], {
      apiToken: 'test-token',
    }).catch((e) => {
      caught = e
    })
    // 404 isn't in the non-retryable (401/400) short-circuit list, so
    // embedBatchWithRetry backs off and retries MAX_RETRIES times before
    // giving up — advance fake timers so the promise settles without a
    // real multi-second wait.
    await vi.runAllTimersAsync()
    await promise

    expect(caught).toBeInstanceOf(EmbeddingError)
    expect((caught as EmbeddingError).status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(3) // MAX_RETRIES
  })

  it('leaves status undefined and marks isNetworkError on a transport failure (fetch rejects)', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed: getaddrinfo ENOTFOUND router.huggingface.co')
    })
    vi.stubGlobal('fetch', fetchMock)

    let caught: unknown
    const promise = embedTexts(['some resident correspondence body text goes here'], {
      apiToken: 'test-token',
    }).catch((err) => {
      caught = err
    })
    // Network errors aren't in the 401/400 short-circuit list either, so
    // this retries MAX_RETRIES times with real backoff — advance fake
    // timers so the promise settles without a real multi-second wait.
    await vi.runAllTimersAsync()
    await promise

    expect(caught).toBeInstanceOf(EmbeddingError)
    const err = caught as EmbeddingError
    expect(err.status).toBeUndefined()
    expect(err.isNetworkError).toBe(true)
  })
})
