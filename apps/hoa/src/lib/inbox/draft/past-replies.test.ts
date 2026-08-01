import { describe, it, expect, vi } from 'vitest'
import { findSimilarReplies } from './past-replies'

vi.mock('@homeowner-portal/ai', () => ({
  embedTexts: vi.fn(async () => [[0.1, 0.2, 0.3]]),
  toPgVector: (v: number[]) => `[${v.join(',')}]`,
}))

function dbReturning(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) } as never
}

describe('findSimilarReplies', () => {
  it('returns replies on success', async () => {
    const db = dbReturning({
      data: [
        {
          message_id: 'm1',
          thread_id: 't9',
          body: 'We received your request.',
          subject: 'Fence',
          sent_at: '2026-01-01T00:00:00Z',
          similarity: 0.82,
        },
      ],
      error: null,
    })
    const result = await findSimilarReplies(db, 'org-1', 'fence question', 't1')
    expect(result.replies).toHaveLength(1)
    expect(result.replies[0]!.messageId).toBe('m1')
    expect(result.degraded).toEqual([])
  })

  // Added after review. The three tests above mock `rpc` with a function that
  // ignores its arguments, so a wrapper that dropped or mis-mapped a
  // parameter would pass all of them. That is not hypothetical padding: both
  // properties asserted here are enforced only inside the SQL function, and
  // a caller that forgets to pass them fails silently rather than loudly.
  //
  // p_exclude_thread_id missing => the search returns the thread's OWN prior
  // replies as "similar past replies", so a draft is grounded in the very
  // conversation it is answering — it would quote itself back at the
  // resident, and look merely repetitive rather than broken.
  //
  // p_org_id missing or wrong => for the service-role caller, RLS is bypassed
  // and this parameter is the ONLY tenant boundary. Getting it wrong returns
  // another association's correspondence as an example to imitate.
  it('passes the org and the excluded thread through to the search', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }))
    const db = { rpc } as never

    await findSimilarReplies(db, 'org-1', 'fence question', 't1')

    expect(rpc).toHaveBeenCalledWith(
      'search_reply_embeddings',
      expect.objectContaining({
        p_org_id: 'org-1',
        p_exclude_thread_id: 't1',
      }),
    )
  })

  it('honours an explicit limit rather than silently using the default', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }))
    const db = { rpc } as never

    await findSimilarReplies(db, 'org-1', 'anything', 't1', 3)

    expect(rpc).toHaveBeenCalledWith(
      'search_reply_embeddings',
      expect.objectContaining({ p_limit: 3 }),
    )
  })

  it('degrades rather than throwing when the search fails', async () => {
    const db = dbReturning({ data: null, error: { code: '08006', message: 'connection reset' } })
    const result = await findSimilarReplies(db, 'org-1', 'anything', 't1')
    expect(result.replies).toEqual([])
    expect(result.degraded).toContain('past_replies')
  })

  it('degrades rather than throwing when embedding fails', async () => {
    const { embedTexts } = await import('@homeowner-portal/ai')
    vi.mocked(embedTexts).mockRejectedValueOnce(new Error('HF down'))
    const db = dbReturning({ data: [], error: null })
    const result = await findSimilarReplies(db, 'org-1', 'anything', 't1')
    expect(result.replies).toEqual([])
    expect(result.degraded).toContain('past_replies')
  })
})
