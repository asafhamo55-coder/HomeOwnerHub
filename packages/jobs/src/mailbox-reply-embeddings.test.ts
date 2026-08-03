import { describe, it, expect, vi, beforeEach } from 'vitest'

// embedTexts is mocked so this suite never touches the network or a real
// HuggingFace call. EmbeddingError stays real so `instanceof` checks in
// mailbox-reply-embeddings.ts work against the class the tests construct,
// matching the mocking style used in mailbox-send.test.ts.
vi.mock('@homeowner-portal/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@homeowner-portal/ai')>()
  return {
    ...actual,
    embedTexts: vi.fn(),
    toPgVector: (v: number[]) => `[${v.join(',')}]`,
  }
})

import { runMailboxReplyEmbeddings } from './mailbox-reply-embeddings'
import { embedTexts, EmbeddingError } from '@homeowner-portal/ai'

type Row = { data: unknown; error: unknown }

const RESIDENT_TEXT =
  'Thank you for reaching out about the fence variance, I will get the survey to you by Friday.'

function candidateRow(id: string, text = RESIDENT_TEXT) {
  return {
    id,
    organization_id: 'org-1',
    stripped_text: text,
    body_text: text,
    inbox_reply_embeddings: null,
  }
}

/**
 * Minimal `.from(table)` stand-in. `inbox_messages` is read once (the
 * candidate query); `inbox_reply_embeddings` is written via `.upsert(...)`
 * any number of times, each call resolving with the next queued result (or
 * `{ error: null }` if the queue runs dry, since most tests don't care about
 * the upsert outcome).
 */
function buildDb(opts: { candidates: Row; upserts?: Row[] }) {
  const upsertQueue = [...(opts.upserts ?? [])]
  const upsertCalls: unknown[] = []

  const from = vi.fn((table: string) => {
    if (table === 'inbox_messages') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              limit: vi.fn(async () => opts.candidates),
            })),
          })),
        })),
      }
    }
    if (table === 'inbox_reply_embeddings') {
      return {
        upsert: vi.fn(async (payload: unknown) => {
          upsertCalls.push(payload)
          return upsertQueue.shift() ?? { data: null, error: null }
        }),
      }
    }
    throw new Error(`buildDb: unexpected table "${table}"`)
  })

  return { db: { from } as never, upsertCalls }
}

function fakeLogger() {
  return { info: vi.fn(), error: vi.fn() }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runMailboxReplyEmbeddings — status propagation on embed failure', () => {
  it('includes the HTTP status in both the log line and the rethrown message on a non-OK response', async () => {
    const { db } = buildDb({
      candidates: { data: [candidateRow('msg-1')], error: null },
    })
    const logger = fakeLogger()

    vi.mocked(embedTexts).mockRejectedValueOnce(
      new EmbeddingError(
        'Embedding request failed: 404 Not Found some-provider-body-fragment',
        undefined,
        404,
        false,
      ),
    )

    let caught: Error | undefined
    try {
      await runMailboxReplyEmbeddings(db, logger)
    } catch (e) {
      caught = e as Error
    }

    expect(caught).toBeDefined()
    expect(caught!.message).toContain('status=404')
    // Never the provider body / message verbatim — PII must not leak.
    expect(caught!.message).not.toContain('some-provider-body-fragment')

    expect(logger.error).toHaveBeenCalledTimes(1)
    const loggedMessage = vi.mocked(logger.error).mock.calls[0]![0] as string
    expect(loggedMessage).toContain('status=404')
    expect(loggedMessage).not.toContain('some-provider-body-fragment')
  })

  it('reports status=none(network?) when the failure is a transport error, not an HTTP response', async () => {
    const { db } = buildDb({
      candidates: { data: [candidateRow('msg-2')], error: null },
    })
    const logger = fakeLogger()

    vi.mocked(embedTexts).mockRejectedValueOnce(
      new EmbeddingError('Network error reaching embedding endpoint', undefined, undefined, true),
    )

    await expect(runMailboxReplyEmbeddings(db, logger)).rejects.toThrow(/status=none/)
    const loggedMessage = vi.mocked(logger.error).mock.calls[0]![0] as string
    expect(loggedMessage).toContain('status=none')
  })

  it('never logs or rethrows error.message verbatim, only the sanitized name+status', async () => {
    const { db } = buildDb({
      candidates: { data: [candidateRow('msg-3')], error: null },
    })
    const logger = fakeLogger()

    const leakySubstring = 'resident@example.com said the fence line is wrong'
    vi.mocked(embedTexts).mockRejectedValueOnce(
      new EmbeddingError(`Embedding request failed: 400 Bad Request ${leakySubstring}`, undefined, 400, false),
    )

    let caught: Error | undefined
    try {
      await runMailboxReplyEmbeddings(db, logger)
    } catch (e) {
      caught = e as Error
    }

    expect(caught).toBeDefined()
    expect(caught!.message).not.toContain(leakySubstring)
    expect(caught!.message).toContain('status=400')
    const loggedMessage = vi.mocked(logger.error).mock.calls[0]![0] as string
    expect(loggedMessage).not.toContain(leakySubstring)
  })
})
