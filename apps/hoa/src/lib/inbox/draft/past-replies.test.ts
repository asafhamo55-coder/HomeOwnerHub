import { describe, it, expect, vi } from 'vitest'
import { findSimilarReplies } from './past-replies'

vi.mock('@homeowner-portal/ai', () => ({
  embedTexts: vi.fn(async () => [[0.1, 0.2, 0.3]]),
  toPgVector: (v: number[]) => `[${v.join(',')}]`,
}))

// threads: thread id -> unit id (or null); units: unit id -> association id.
function dbWith(
  rpcResult: { data: unknown; error: unknown },
  opts: { threads?: Record<string, string | null>; units?: Record<string, string> } = {},
) {
  const threads = opts.threads ?? { t9: 'u1' }
  const units = opts.units ?? { u1: 'assoc-1' }
  const lastUnitFilter: { assoc?: string } = {}
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    chain.select = () => chain
    chain.eq = (col: string, val: string) => {
      if (col === 'association_id') lastUnitFilter.assoc = val
      return chain
    }
    chain.in = async (_c: string, ids: string[]) => {
      if (table === 'inbox_threads')
        return {
          data: ids.filter((i) => i in threads).map((i) => ({ id: i, unit_id: threads[i] })),
          error: null,
        }
      return {
        data: ids
          .filter((i) => units[i] && units[i] === lastUnitFilter.assoc)
          .map((i) => ({ id: i })),
        error: null,
      }
    }
    return chain
  })
  return { rpc: vi.fn(async () => rpcResult), from } as never
}
const row = (over: Record<string, unknown> = {}) => ({
  message_id: 'm1',
  thread_id: 't9',
  body: 'We received your request.',
  subject: 'Fence',
  sent_at: '2026-01-01T00:00:00Z',
  similarity: 0.82,
  ...over,
})

describe('findSimilarReplies', () => {
  it('returns replies on success', async () => {
    const db = dbWith({ data: [row()], error: null })
    const result = await findSimilarReplies(db, 'org-1', 'assoc-1', 'fence question', 't1')
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

    await findSimilarReplies(db, 'org-1', 'assoc-1', 'fence question', 't1')

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

    await findSimilarReplies(db, 'org-1', 'assoc-1', 'anything', 't1', 3)

    // The page is fetched in full so the association filter cannot starve it.
    expect(rpc).toHaveBeenCalledWith(
      'search_reply_embeddings',
      expect.objectContaining({ p_limit: 20 }),
    )
  })

  it('returns at most the requested number after filtering', async () => {
    const data = [1, 2, 3, 4].map((n) => row({ message_id: `m${n}` }))
    const db = dbWith({ data, error: null })
    const result = await findSimilarReplies(db, 'org-1', 'assoc-1', 'q', 't1', 2)
    expect(result.replies.map((r) => r.messageId)).toEqual(['m1', 'm2'])
  })

  it('drops replies from other associations and from threads with no unit', async () => {
    const db = dbWith(
      {
        data: [
          row({ message_id: 'mine', thread_id: 't-mine' }),
          row({ message_id: 'other', thread_id: 't-other' }),
          row({ message_id: 'nounit', thread_id: 't-none' }),
        ],
        error: null,
      },
      {
        threads: { 't-mine': 'u1', 't-other': 'u2', 't-none': null },
        units: { u1: 'assoc-1', u2: 'assoc-2' },
      },
    )
    const result = await findSimilarReplies(db, 'org-1', 'assoc-1', 'q', 't1')
    expect(result.replies.map((r) => r.messageId)).toEqual(['mine'])
  })

  it('drops examples below the similarity floor', async () => {
    const db = dbWith({
      data: [row({ message_id: 'near' }), row({ message_id: 'far', similarity: 0.2 })],
      error: null,
    })
    const result = await findSimilarReplies(db, 'org-1', 'assoc-1', 'q', 't1')
    expect(result.replies.map((r) => r.messageId)).toEqual(['near'])
  })

  it('searches nothing and reports degraded when there is no association', async () => {
    const db = dbWith({ data: [row()], error: null })
    const result = await findSimilarReplies(db, 'org-1', null, 'q', 't1')
    expect(result.replies).toEqual([])
    expect(result.degraded).toContain('past_replies')
    expect((db as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled()
  })

  it('degrades rather than throwing when the search fails', async () => {
    const db = dbWith({ data: null, error: { code: '08006', message: 'connection reset' } })
    const result = await findSimilarReplies(db, 'org-1', 'assoc-1', 'anything', 't1')
    expect(result.replies).toEqual([])
    expect(result.degraded).toContain('past_replies')
  })

  it('degrades rather than throwing when embedding fails', async () => {
    const { embedTexts } = await import('@homeowner-portal/ai')
    vi.mocked(embedTexts).mockRejectedValueOnce(new Error('HF down'))
    const db = dbWith({ data: [], error: null })
    const result = await findSimilarReplies(db, 'org-1', 'assoc-1', 'anything', 't1')
    expect(result.replies).toEqual([])
    expect(result.degraded).toContain('past_replies')
  })
})
