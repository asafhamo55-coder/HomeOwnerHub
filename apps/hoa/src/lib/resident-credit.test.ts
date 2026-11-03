import { describe, expect, it, vi } from 'vitest'

const m7 = vi.hoisted(() => ({ on: true }))
vi.mock('@homeowner-portal/db/m7', () => ({
  get M7_APPLIED() {
    return m7.on
  },
}))

import { loadResidentCredit } from './resident-credit'

type Row = { id: string; unit_id: string; remaining: number | string; received_on: string; payment_method: string }
type Seen = { inIds?: string[]; calls: number }

function fakeDb(result: { data?: Row[]; error?: unknown }, seen: Seen) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.in = (_c: string, ids: string[]) => {
    seen.inIds = ids
    return q
  }
  q.gt = () => q
  q.eq = () => q
  q.order = () => q
  q.limit = () => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
  return {
    from: () => {
      seen.calls++
      return q
    },
  } as never
}
const row = (unit: string, remaining: number): Row => ({
  id: `c-${unit}-${remaining}`,
  unit_id: unit,
  remaining,
  received_on: '2026-10-01',
  payment_method: 'check',
})

describe('loadResidentCredit', () => {
  it('sums credit across the resident own units in one query', async () => {
    m7.on = true
    const seen: Seen = { calls: 0 }
    const c = await loadResidentCredit(fakeDb({ data: [row('u1', 10.1), row('u1', 20.2), row('u2', 5)] }, seen), ['u1', 'u2'], null)
    expect(c).toEqual({ total: 35.3, unitIds: ['u1', 'u2'] })
    expect(seen.calls).toBe(1)
  })
  it('is scoped to the resident own units, in the query and in the sum', async () => {
    m7.on = true
    const seen: Seen = { calls: 0 }
    const c = await loadResidentCredit(fakeDb({ data: [row('u1', 10), row('neighbour', 999)] }, seen), ['u1'], null)
    expect(seen.inIds).toEqual(['u1'])
    expect(c).toEqual({ total: 10, unitIds: ['u1'] })
  })
  it('is null at zero credit', async () => {
    m7.on = true
    const seen: Seen = { calls: 0 }
    expect(await loadResidentCredit(fakeDb({ data: [] }, seen), ['u1'], null)).toBeNull()
    expect(await loadResidentCredit(fakeDb({ data: [row('u1', 0)] }, seen), ['u1'], null)).toBeNull()
  })
  it('is null on a failed read, and never throws', async () => {
    m7.on = true
    const seen: Seen = { calls: 0 }
    expect(await loadResidentCredit(fakeDb({ error: { message: 'boom' } }, seen), ['u1'], null)).toBeNull()
    const throwing = {
      from: () => {
        throw new Error('down')
      },
    } as never
    expect(await loadResidentCredit(throwing, ['u1'], null)).toBeNull()
  })
  it('makes no query before M7_APPLIED', async () => {
    m7.on = false
    const seen: Seen = { calls: 0 }
    expect(await loadResidentCredit(fakeDb({ data: [row('u1', 50)] }, seen), ['u1'], null)).toBeNull()
    expect(seen.calls).toBe(0)
  })
})

describe('loadResidentCredit sale window', () => {
  it('does not count or reveal a credit received before the buyer’s window', async () => {
    m7.on = true
    const seen: Seen = { calls: 0 }
    const rows = [
      { ...row('u1', 50), received_on: '2026-09-20' },
      { ...row('u1', 7), received_on: '2026-10-20' },
    ]
    const c = await loadResidentCredit(fakeDb({ data: rows }, seen), ['u1'], null, new Map([['u1', '2026-10-15']]))
    expect(c).toEqual({ total: 7, unitIds: ['u1'] })
    const none = await loadResidentCredit(fakeDb({ data: [rows[0]!] }, seen), ['u1'], null, new Map([['u1', '2026-10-15']]))
    expect(none).toBeNull()
  })
})
