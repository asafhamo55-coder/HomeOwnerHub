import { describe, expect, it } from 'vitest'
import { addMethodLimitMessage, checkAndRecordAddMethod, decideAddMethod } from './method-rate-limit'

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0)
const ago = (s: number) => NOW - s * 1000

describe('decideAddMethod', () => {
  it('allows a few tries', () => {
    expect(decideAddMethod([ago(60), ago(120), ago(180), ago(240)], NOW)).toEqual({ ok: true })
  })

  it('blocks the sixth start in an hour and says when the oldest ages out', () => {
    const d = decideAddMethod([ago(60), ago(120), ago(180), ago(240), ago(300)], NOW)
    expect(d).toEqual({ ok: false, retryAfterSeconds: 3600 - 300 })
  })

  it('blocks the eleventh start in a day even when the hour is quiet', () => {
    const stamps = Array.from({ length: 10 }, (_, i) => ago(2 * 3600 + i * 600))
    const d = decideAddMethod(stamps, NOW)
    expect(d.ok).toBe(false)
  })

  it('forgets starts older than a day', () => {
    expect(decideAddMethod(Array.from({ length: 20 }, () => ago(90_000)), NOW)).toEqual({ ok: true })
  })
})

describe('addMethodLimitMessage', () => {
  it('uses plain words, no em dash', () => {
    for (const s of [30, 600, 3500, 7300]) {
      const m = addMethodLimitMessage(s)
      expect(m).toMatch(/try again in/)
      expect(m).not.toContain('—')
    }
  })
})

describe('checkAndRecordAddMethod', () => {
  function fakeDb(rows: Array<{ created_at: string }>, readError = false) {
    const inserted: unknown[] = []
    const db = {
      from: () => {
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'gte', 'order', 'limit']) q[m] = () => q
        q.insert = (row: unknown) => (inserted.push(row), q)
        q.then = (ok: (v: unknown) => unknown) =>
          Promise.resolve(readError ? { data: null, error: { code: 'XX' } } : { data: rows, error: null }).then(ok)
        return q
      },
    }
    return { db, inserted }
  }

  it('records an allowed start', async () => {
    const f = fakeDb([])
    expect(await checkAndRecordAddMethod(f.db, { orgId: 'o', userId: 'u' }, NOW)).toEqual({ ok: true })
    expect(f.inserted).toHaveLength(1)
  })

  it('records nothing when blocked', async () => {
    const f = fakeDb(Array.from({ length: 5 }, (_, i) => ({ created_at: new Date(ago(60 * (i + 1))).toISOString() })))
    expect((await checkAndRecordAddMethod(f.db, { orgId: 'o', userId: 'u' }, NOW)).ok).toBe(false)
    expect(f.inserted).toHaveLength(0)
  })

  it('fails CLOSED when the ledger cannot be read: adding a method is not paying, and a silent outage would disable the guard', async () => {
    const f = fakeDb([], true)
    const d = await checkAndRecordAddMethod(f.db, { orgId: 'o', userId: 'u' }, NOW)
    expect(d.ok).toBe(false)
    expect(f.inserted).toHaveLength(0)
  })

  it('fails closed when this start cannot be recorded, so Stripe is never called uncounted', async () => {
    const f = fakeDb([])
    const failing = {
      from: () => {
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'gte', 'order', 'limit']) q[m] = () => q
        q.insert = () => Promise.resolve({ error: { code: 'XX' } })
        q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
        return q
      },
    }
    expect((await checkAndRecordAddMethod(failing, { orgId: 'o', userId: 'u' }, NOW)).ok).toBe(false)
    expect(f.inserted).toHaveLength(0)
  })
})
