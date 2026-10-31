import { describe, expect, it, vi } from 'vitest'
import {
  DISPATCH_BATCH,
  runScheduledDispatch,
  supabaseScheduledStore,
  STUCK_AFTER_MS,
  type ScheduledStore,
} from './communications-scheduled'

/**
 * BL-102 A1: the scheduled-messages dispatcher. No database and no
 * provider — the store is in memory and delivery is a spy.
 */

const NOW = new Date('2026-10-19T14:00:00Z')

type Status = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'
interface Row {
  id: string
  status: Status
  scheduled_for: string
}

/** In-memory store whose claim behaves like the conditional UPDATE: one
 *  synchronous compare-and-set, so only one caller can flip a row. */
function memoryStore(rows: Row[]): ScheduledStore & { rows: Row[] } {
  return {
    rows,
    async listDue(nowIso, limit) {
      return rows
        .filter((r) => r.status === 'scheduled' && r.scheduled_for <= nowIso)
        .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
        .slice(0, limit)
        .map((r) => r.id)
    },
    async claim(id, nowIso) {
      // Yield first, so two concurrent runs both get here before either claims.
      await Promise.resolve()
      const row = rows.find((r) => r.id === id)
      if (!row || row.status !== 'scheduled' || row.scheduled_for > nowIso) return false
      row.status = 'sending'
      return true
    },
    async markFailed(id) {
      const row = rows.find((r) => r.id === id)
      if (row && row.status === 'sending') row.status = 'failed'
    },
  }
}

const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const ok = { ok: true as const, sentCount: 2, failedCount: 0, skippedCount: 0, optedOutCount: 0 }

describe('runScheduledDispatch', () => {
  it('delivers only due, scheduled messages, oldest first', async () => {
    const store = memoryStore([
      { id: 'later', status: 'scheduled', scheduled_for: '2026-10-19T15:00:00.000Z' },
      { id: 'due-2', status: 'scheduled', scheduled_for: '2026-10-19T13:55:00.000Z' },
      { id: 'due-1', status: 'scheduled', scheduled_for: '2026-10-19T09:00:00.000Z' },
      { id: 'cancelled', status: 'cancelled', scheduled_for: '2026-10-19T09:00:00.000Z' },
      { id: 'already-sent', status: 'sent', scheduled_for: '2026-10-18T09:00:00.000Z' },
    ])
    const deliver = vi.fn(async () => ok)
    const summary = await runScheduledDispatch(store, { deliver }, NOW, silent)
    expect(deliver.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['due-1', 'due-2'])
    expect(summary).toEqual({ due: 2, claimed: 2, delivered: 2, failed: 0 })
    expect(store.rows.find((r) => r.id === 'later')!.status).toBe('scheduled')
  })

  it('sends at most once when two runs race for the same rows', async () => {
    const store = memoryStore([
      { id: 'a', status: 'scheduled', scheduled_for: '2026-10-19T13:00:00.000Z' },
      { id: 'b', status: 'scheduled', scheduled_for: '2026-10-19T13:01:00.000Z' },
    ])
    const deliver = vi.fn(async () => ok)
    const [one, two] = await Promise.all([
      runScheduledDispatch(store, { deliver }, NOW, silent),
      runScheduledDispatch(store, { deliver }, NOW, silent),
    ])
    expect(deliver).toHaveBeenCalledTimes(2)
    expect(new Set(deliver.mock.calls.map((c) => (c as unknown[])[0]))).toEqual(new Set(['a', 'b']))
    expect(one.claimed + two.claimed).toBe(2)
  })

  it('a message cancelled before the claim is never delivered', async () => {
    const store = memoryStore([{ id: 'x', status: 'scheduled', scheduled_for: '2026-10-19T13:00:00.000Z' }])
    const deliver = vi.fn(async () => ok)
    // Cancel lands between the listing and the claim.
    const step = async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
      if (name === 'claim-x') store.rows[0].status = 'cancelled'
      return fn()
    }
    const summary = await runScheduledDispatch(store, { deliver }, NOW, silent, step)
    expect(deliver).not.toHaveBeenCalled()
    expect(summary.claimed).toBe(0)
  })

  it('a delivery that throws marks the row failed and is not retried', async () => {
    const store = memoryStore([{ id: 'x', status: 'scheduled', scheduled_for: '2026-10-19T13:00:00.000Z' }])
    const deliver = vi.fn(async () => {
      throw new Error('boom')
    })
    const summary = await runScheduledDispatch(store, { deliver }, NOW, silent)
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(store.rows[0].status).toBe('failed')
    expect(summary).toMatchObject({ claimed: 1, failed: 1 })
    // The next run finds nothing to do: the row is no longer 'scheduled'.
    await runScheduledDispatch(store, { deliver }, NOW, silent)
    expect(deliver).toHaveBeenCalledTimes(1)
  })

  it('claims at most one batch per run', async () => {
    const rows: Row[] = Array.from({ length: DISPATCH_BATCH + 3 }, (_, i) => ({
      id: `c${String(i).padStart(2, '0')}`,
      status: 'scheduled' as const,
      scheduled_for: '2026-10-19T13:00:00.000Z',
    }))
    const deliver = vi.fn(async () => ok)
    await runScheduledDispatch(memoryStore(rows), { deliver }, NOW, silent)
    expect(deliver).toHaveBeenCalledTimes(DISPATCH_BATCH)
  })

  it('logs ids and counts only', async () => {
    const store = memoryStore([{ id: 'x', status: 'scheduled', scheduled_for: '2026-10-19T13:00:00.000Z' }])
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    await runScheduledDispatch(store, { deliver: async () => ok }, NOW, logger)
    const lines = [...logger.info.mock.calls, ...logger.warn.mock.calls].map((c) => JSON.stringify(c))
    expect(lines).toEqual(['["[communications-scheduled] x: sent 2, failed 0, skipped 0, held by safety guard 0, opted out 0"]'])
  })
})

describe('supabaseScheduledStore.claim', () => {
  /** Records the PostgREST chain and returns the given rows. */
  function fakeDb(returned: unknown[]) {
    const calls: Array<[string, unknown[]]> = []
    const b: Record<string, unknown> = {}
    for (const op of ['update', 'eq', 'lte', 'is', 'select', 'order', 'limit']) {
      b[op] = (...args: unknown[]) => {
        calls.push([op, args])
        return b
      }
    }
    b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: returned, error: null }).then(res)
    return { db: { from: () => b } as never, calls }
  }

  it('is a conditional scheduled → sending update that returns the row only if it changed', async () => {
    const won = fakeDb([{ id: 'x' }])
    expect(await supabaseScheduledStore(won.db).claim('x', NOW.toISOString())).toBe(true)
    expect(won.calls).toEqual([
      ['update', [{ status: 'sending' }]],
      ['eq', ['id', 'x']],
      ['eq', ['status', 'scheduled']],
      ['lte', ['scheduled_for', NOW.toISOString()]],
      ['is', ['deleted_at', null]],
      ['select', ['id']],
    ])
    const lost = fakeDb([])
    expect(await supabaseScheduledStore(lost.db).claim('x', NOW.toISOString())).toBe(false)
  })
})

describe('runScheduledDispatch — failure reporting (report-only)', () => {
  const due = (id: string): Row => ({ id, status: 'scheduled', scheduled_for: '2026-10-19T13:55:00.000Z' })

  it('reports delivery failures once per run, and not when all delivered', async () => {
    const report = vi.fn()
    const store = memoryStore([due('a'), due('b'), due('c')])
    const deliver = vi.fn(async (id: string) => (id === 'b' ? { ok: false as const, error: 'x' } : ok))
    const summary = await runScheduledDispatch(store, { deliver }, NOW, silent, undefined, report)
    expect(summary).toMatchObject({ claimed: 3, delivered: 2, failed: 1 })
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][2]).toEqual(['b'])

    const quiet = vi.fn()
    await runScheduledDispatch(memoryStore([due('z')]), { deliver: async () => ok }, NOW, silent, undefined, quiet)
    expect(quiet).not.toHaveBeenCalled()
  })

  it('reports a markFailed that throws, and does not retry the send', async () => {
    const report = vi.fn()
    const store = memoryStore([due('a')])
    store.markFailed = vi.fn(async () => {
      throw new Error('write failed')
    })
    const deliver = vi.fn(async () => {
      throw new Error('boom')
    })
    const summary = await runScheduledDispatch(store, { deliver }, NOW, silent, undefined, report)
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(summary).toMatchObject({ failed: 1 })
    expect(report.mock.calls[0][1]).toMatchObject({ markFailedErrors: 1 })
    expect(report.mock.calls[0][2]).toEqual(['a'])
  })

  it('supabase markFailed throws on a write error', async () => {
    const b: Record<string, unknown> = {}
    b.update = () => b
    b.eq = () => b
    b.then = (r: (v: unknown) => unknown) => Promise.resolve({ error: { code: '42' } }).then(r)
    await expect(supabaseScheduledStore({ from: () => b } as never).markFailed('x')).rejects.toThrow(/mark failed/)
  })

  it('stuck check reports old sending rows only, with no sends or status changes', async () => {
    const report = vi.fn()
    const rows: Row[] = [
      { id: 'old', status: 'sending', scheduled_for: new Date(NOW.getTime() - STUCK_AFTER_MS - 60_000).toISOString() },
      { id: 'fresh', status: 'sending', scheduled_for: new Date(NOW.getTime() - 5 * 60_000).toISOString() },
    ]
    const store = memoryStore(rows)
    store.listStuck = async (before) => rows.filter((r) => r.status === 'sending' && r.scheduled_for < before).map((r) => r.id)
    const claim = vi.spyOn(store, 'claim')
    const markFailed = vi.spyOn(store, 'markFailed')
    const deliver = vi.fn()
    await runScheduledDispatch(store, { deliver }, NOW, silent, undefined, report)
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][0]).toBe('communications-scheduled-dispatch:stuck-sending')
    expect(report.mock.calls[0][2]).toEqual(['old'])
    expect(deliver).not.toHaveBeenCalled()
    expect(claim).not.toHaveBeenCalled()
    expect(markFailed).not.toHaveBeenCalled()
    expect(rows.map((r) => r.status)).toEqual(['sending', 'sending'])
  })

  it('supabase listStuck is a read-only select', async () => {
    const calls: string[] = []
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'lt', 'is', 'order', 'limit', 'update', 'insert', 'delete']) {
      b[m] = (...a: unknown[]) => {
        calls.push(`${m}:${a[0]}`)
        return b
      }
    }
    b.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'x' }], error: null }).then(r)
    expect(await supabaseScheduledStore({ from: () => b } as never).listStuck!('t', 50)).toEqual(['x'])
    expect(calls.some((c) => /^(update|insert|delete)/.test(c))).toBe(false)
    expect(calls).toContain('eq:status')
  })
})
