import { describe, expect, it, vi } from 'vitest'
import { BOARD_RATE_WINDOWS, boardRateMessage, checkAndRecordBoardRate, decideBoardRate, enforceBoardRate } from './rate-limit'

const NOW = Date.UTC(2026, 10, 5, 12)

function ledger(rows: number[], opts: { readError?: boolean; writeError?: boolean } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: opts.writeError ? { code: 'x' } : null })
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order']) q[m] = () => q
  q.limit = () =>
    Promise.resolve({
      data: opts.readError ? null : rows.map((t) => ({ created_at: new Date(t).toISOString() })),
      error: opts.readError ? { code: 'x' } : null,
    })
  return { db: { from: () => ({ ...q, insert }) }, insert }
}

describe('board rate limit', () => {
  it('allows a normal neighbor', () => {
    expect(decideBoardRate('reply', [NOW - 1000, NOW - 2000], NOW)).toEqual({ ok: true })
  })
  it('blocks a burst of new topics and says when it frees up', () => {
    const max = BOARD_RATE_WINDOWS.thread[0]!.max
    const stamps = Array.from({ length: max }, (_, i) => NOW - (i + 1) * 60_000)
    const d = decideBoardRate('thread', stamps, NOW)
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.retryAfterSeconds).toBeGreaterThan(0)
  })
  it('records an allowed attempt', async () => {
    const { db, insert } = ledger([])
    expect(await checkAndRecordBoardRate(db, 'report', { orgId: 'o', userId: 'u' }, NOW)).toEqual({ ok: true })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'community_board.report_sent', user_id: 'u' }))
  })
  it('fails closed when the ledger cannot be read or written', async () => {
    const r = await checkAndRecordBoardRate(ledger([], { readError: true }).db, 'reply', { orgId: 'o', userId: 'u' }, NOW)
    expect(r).toMatchObject({ ok: false, unavailable: true })
    const w = await checkAndRecordBoardRate(ledger([], { writeError: true }).db, 'reply', { orgId: 'o', userId: 'u' }, NOW)
    expect(w).toMatchObject({ ok: false, unavailable: true })
  })
  it('throws a 429 with plain words', async () => {
    const stamps = Array.from({ length: 20 }, (_, i) => Date.now() - (i + 1) * 1000)
    const { db } = ledger(stamps)
    await expect(enforceBoardRate(db, 'reply', { orgId: 'o', userId: 'u' })).rejects.toMatchObject({ code: 'rate_limited', status: 429 })
    expect(boardRateMessage('reply', 300)).toBe('You have posted a lot of replies in a short time. Please try again in 5 minutes.')
  })
})
