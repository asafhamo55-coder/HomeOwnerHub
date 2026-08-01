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
