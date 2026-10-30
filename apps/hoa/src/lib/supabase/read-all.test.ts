import { describe, expect, it } from 'vitest'
import { PAGE_ROWS, readAll } from './read-all'

function fake(total: number, cap = Infinity) {
  let trips = 0
  const page = async (from: number, to: number) => {
    trips++
    const n = Math.max(0, Math.min(to - from + 1, cap, total - from))
    return { data: Array.from({ length: n }, (_, i) => from + i), error: null }
  }
  return { page, trips: () => trips }
}
const onError = () => new Error('boom')
const expectAll = (rows: number[], total: number) => {
  expect(rows.length).toBe(total)
  expect(rows.every((v, i) => v === i)).toBe(true)
}

describe('readAll', () => {
  it('returns [] for an empty table in one trip', async () => {
    const f = fake(0)
    expect(await readAll(f.page, onError)).toEqual([])
    expect(f.trips()).toBe(1)
  })
  it('reads exactly PAGE_ROWS rows', async () => {
    const f = fake(PAGE_ROWS)
    expectAll(await readAll(f.page, onError), PAGE_ROWS)
    expect(f.trips()).toBe(2) // full page, then the empty probe
  })
  it('reads PAGE_ROWS + 1 rows', async () => {
    const f = fake(PAGE_ROWS + 1)
    expectAll(await readAll(f.page, onError), PAGE_ROWS + 1)
    expect(f.trips()).toBe(2) // short page is provably final: no probe
  })
  it('saves the trailing probe on a typical multi-page read', async () => {
    const f = fake(2500)
    expectAll(await readAll(f.page, onError), 2500)
    expect(f.trips()).toBe(3) // was 4
  })
  it('keeps the probe for a lone short first page (could be a cap)', async () => {
    const f = fake(300)
    expectAll(await readAll(f.page, onError), 300)
    expect(f.trips()).toBe(2)
  })
  it.each([1, 7, 400, 500, 999])('never truncates under a server cap of %i', async (cap) => {
    for (const total of [0, 1, cap - 1, cap, cap + 1, cap * 3, cap * 3 + 1, 2500]) {
      const f = fake(total, cap)
      expectAll(await readAll(f.page, onError), total)
    }
  })
  it('throws via onError on a page error', async () => {
    await expect(
      readAll(async () => ({ data: null, error: { code: 'x' } }), onError),
    ).rejects.toThrow('boom')
  })
})
