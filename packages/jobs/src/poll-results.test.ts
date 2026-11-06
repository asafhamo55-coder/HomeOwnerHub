import { describe, expect, it, vi } from 'vitest'
import { RESULTS_CATCH_UP_DAYS, listDuePolls, runPollResults } from './poll-results'

const NOW = new Date('2026-11-06T14:00:00Z')

function fakeDb(rows: Array<{ id: string; association_id: string }>, error: { code?: string } | null = null) {
  const calls: Array<[string, ...unknown[]]> = []
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'lte', 'gte', 'order']) {
    q[m] = (...a: unknown[]) => {
      calls.push([m, ...a])
      return q
    }
  }
  q.limit = () => Promise.resolve({ data: rows, error })
  return { db: { from: () => q }, calls }
}

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

describe('listDuePolls', () => {
  it('asks for open polls whose end passed inside the catch-up window, nothing else', async () => {
    const { db, calls } = fakeDb([{ id: 'p1', association_id: 'a1' }])
    const due = await listDuePolls(db, NOW)
    expect(due).toEqual([{ pollId: 'p1', associationId: 'a1' }])
    expect(calls).toContainEqual(['eq', 'status', 'open'])
    expect(calls).toContainEqual(['lte', 'closes_at', NOW.toISOString()])
    const since = new Date(NOW.getTime() - RESULTS_CATCH_UP_DAYS * 86400_000).toISOString()
    expect(calls).toContainEqual(['gte', 'closes_at', since])
  })

  it('throws with the code only when the read fails', async () => {
    const { db } = fakeDb([], { code: '42501' })
    await expect(listDuePolls(db, NOW)).rejects.toThrow('poll-results: list failed (42501)')
  })
})

describe('runPollResults', () => {
  it('hands each due poll to the app-side delivery once, and counts what went out', async () => {
    const { db } = fakeDb([
      { id: 'p1', association_id: 'a1' },
      { id: 'p2', association_id: 'a2' },
      { id: 'p3', association_id: 'a3' },
    ])
    const deliver = vi.fn(async (p: { pollId: string }) =>
      p.pollId === 'p1' ? { status: 'sent', sent: 9 } : p.pollId === 'p2' ? { status: 'not_opted_in', sent: 0 } : { status: 'already_sent', sent: 0 },
    )
    const log = logger()
    expect(await runPollResults(db, { deliver }, NOW, log)).toEqual({ due: 3, sent: 1, skipped: 2 })
    expect(deliver).toHaveBeenCalledTimes(3)
    expect(deliver).toHaveBeenCalledWith({ pollId: 'p2', associationId: 'a2' })
  })

  it('one poll that throws does not stop the others, and the log has ids only', async () => {
    const { db } = fakeDb([
      { id: 'p1', association_id: 'a1' },
      { id: 'p2', association_id: 'a2' },
    ])
    const deliver = vi.fn(async (p: { pollId: string }) => {
      if (p.pollId === 'p1') throw new TypeError('secret resident@example.test')
      return { status: 'sent', sent: 2 }
    })
    const log = logger()
    expect(await runPollResults(db, { deliver }, NOW, log)).toEqual({ due: 2, sent: 1, skipped: 1 })
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('example.test')
  })

  it('nothing due: nothing delivered', async () => {
    const { db } = fakeDb([])
    const deliver = vi.fn()
    expect(await runPollResults(db, { deliver }, NOW, logger())).toEqual({ due: 0, sent: 0, skipped: 0 })
    expect(deliver).not.toHaveBeenCalled()
  })
})
