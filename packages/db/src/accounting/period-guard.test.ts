import { describe, expect, it } from 'vitest'
import { assertPeriodOpen, CLOSED_PERIOD_MESSAGE } from './period-guard'

/** Minimal chainable fake of the one query the guard makes. */
function fakeDb(result: { data: unknown; error: { message: string } | null }, seen?: { calls: string[] }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'lte', 'gte', 'or', 'limit']) {
    chain[m] = (...a: unknown[]) => {
      seen?.calls.push(`${m}:${a.join(',')}`)
      return chain
    }
  }
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return {
    from: (t: string) => {
      seen?.calls.push(`from:${t}`)
      return chain
    },
  } as never
}

describe('assertPeriodOpen', () => {
  it('passes when no closed period covers the date', async () => {
    const r = await assertPeriodOpen(fakeDb({ data: [], error: null }), { associationId: 'a', date: '2026-03-01' })
    expect(r).toEqual({ ok: true })
  })

  it('blocks with plain words when a closed period covers the date', async () => {
    const r = await assertPeriodOpen(fakeDb({ data: [{ id: 'p' }], error: null }), { associationId: 'a', date: '2025-03-01' })
    expect(r).toEqual({ ok: false, error: CLOSED_PERIOD_MESSAGE })
    expect(CLOSED_PERIOD_MESSAGE).toMatch(/closed/i)
    expect(CLOSED_PERIOD_MESSAGE).not.toMatch(/fiscal_period|status|null/)
  })

  it('fails closed when the lookup errors, without leaking the raw message', async () => {
    const r = await assertPeriodOpen(fakeDb({ data: null, error: { message: 'boom' } }), { associationId: 'a', date: '2026-03-01' })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).not.toContain('boom')
  })

  it('fails closed when the lookup returns nothing at all', async () => {
    const r = await assertPeriodOpen(fakeDb({ data: null, error: null }), { associationId: 'a', date: '2026-03-01' })
    expect(r.ok).toBe(false)
  })

  it('fails closed on a malformed date and never queries', async () => {
    const seen = { calls: [] as string[] }
    const r = await assertPeriodOpen(fakeDb({ data: [], error: null }, seen), { associationId: 'a', date: 'garbage' })
    expect(r.ok).toBe(false)
    expect(seen.calls).toEqual([])
  })

  it('also checks a named period id', async () => {
    const seen = { calls: [] as string[] }
    await assertPeriodOpen(fakeDb({ data: [], error: null }, seen), { associationId: 'a', date: '2026-03-01', fiscalPeriodId: 'p1' })
    expect(seen.calls.some((c) => c.includes('p1'))).toBe(true)
  })

  it('only counts status closed (closing entries post while status is closing)', async () => {
    const seen = { calls: [] as string[] }
    await assertPeriodOpen(fakeDb({ data: [], error: null }, seen), { associationId: 'a', date: '2026-03-01' })
    expect(seen.calls).toContain('eq:status,closed')
  })
})
