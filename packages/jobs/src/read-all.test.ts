import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PAGE_ROWS, configuredServerCap, readAll } from './read-all'

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

describe('jobs readAll', () => {
  it('returns [] for an empty table in one trip', async () => {
    const f = fake(0)
    expect(await readAll(f.page, onError, undefined, undefined)).toEqual([])
    expect(f.trips()).toBe(1)
  })
  it('env unset: always ends on the empty probe (no shortcut)', async () => {
    const f = fake(300)
    expectAll(await readAll(f.page, onError, undefined, undefined), 300)
    expect(f.trips()).toBe(2)
    const g = fake(PAGE_ROWS + 1)
    expectAll(await readAll(g.page, onError, undefined, undefined), PAGE_ROWS + 1)
    expect(g.trips()).toBe(3)
  })
  it('with a confirmed cap of 1000, a lone short first page is final: one trip', async () => {
    const f = fake(300)
    expectAll(await readAll(f.page, onError, undefined, 1000), 300)
    expect(f.trips()).toBe(1)
  })
  it('a confirmed lower cap still reads everything', async () => {
    const f = fake(300, 100)
    expectAll(await readAll(f.page, onError, undefined, 100), 300)
  })
  it.each([1, 7, 400, 500, 999])('never truncates under a server cap of %i', async (cap) => {
    for (const total of [0, 1, cap - 1, cap, cap + 1, cap * 3, cap * 3 + 1, 2500]) {
      const f = fake(total, cap)
      expectAll(await readAll(f.page, onError, undefined, undefined), total)
    }
  })
  it('throws past maxRows rather than returning a partial set', async () => {
    const f = fake(5000)
    await expect(readAll(f.page, onError, 1500, undefined)).rejects.toThrow(/more than 1500 rows/)
  })
  it('configuredServerCap is opt-in and strict', () => {
    expect(configuredServerCap({})).toBeUndefined()
    for (const bad of ['0', '', '-5', '500x', '1.5', 'x']) {
      expect(configuredServerCap({ POSTGREST_MAX_ROWS: bad })).toBeUndefined()
    }
    expect(configuredServerCap({ POSTGREST_MAX_ROWS: '400' })).toBe(400)
    expect(configuredServerCap({ POSTGREST_MAX_ROWS: '1000' })).toBe(1000)
    expect(configuredServerCap({ POSTGREST_MAX_ROWS: '5000' })).toBe(1000)
  })
  it('throws via onError on a page error', async () => {
    await expect(
      readAll(async () => ({ data: null, error: { code: 'x' } }), onError, undefined, undefined),
    ).rejects.toThrow('boom')
  })
  it('configuredServerCap source stays in sync with the app twin', () => {
    const grab = (p: string) => {
      const src = readFileSync(new URL(p, import.meta.url), 'utf8')
      const m = src.match(/export function configuredServerCap[\s\S]*?\n}\n/)
      expect(m).not.toBeNull()
      return m![0]
    }
    expect(grab('./read-all.ts')).toBe(grab('../../../apps/hoa/src/lib/supabase/read-all.ts'))
  })
})
