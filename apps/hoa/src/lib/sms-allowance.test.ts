import { describe, expect, it, vi } from 'vitest'
import { PRICING_V2 } from '@homeowner-portal/billing'
import { readSmsAllowance, smsAllowanceGate, utcMonthRange } from './sms-allowance'

// BL-104 §4: the SMS allowance read from send records. In-memory db fake;
// nothing here sends a text or touches a database.

type Filters = Array<[string, string, unknown]>

function fakeDb(o: { plan?: string | null; homes?: number; texts?: number; textsError?: boolean }) {
  const reads: Array<{ table: string; filters: Filters }> = []
  const db = {
    from: vi.fn((table: string) => {
      const filters: Filters = []
      reads.push({ table, filters })
      const chain: Record<string, unknown> = {}
      for (const k of ['eq', 'gte', 'lt']) chain[k] = (c: string, v: unknown) => (filters.push([k, c, v]), chain)
      chain.select = () => chain
      chain.maybeSingle = () => chain
      chain.then = (res: (v: unknown) => unknown) => {
        if (table === 'orgs') return Promise.resolve({ data: o.plan === undefined ? null : { plan: o.plan }, error: null }).then(res)
        if (table === 'hoa_properties') return Promise.resolve({ count: o.homes ?? 0, error: null }).then(res)
        if (table === 'communication_recipients') {
          return Promise.resolve(o.textsError ? { count: null, error: { code: '57014' } } : { count: o.texts ?? 0, error: null }).then(res)
        }
        throw new Error(table)
      }
      return chain
    }),
  }
  return { db: db as never, reads, from: db.from }
}

const NOW = Date.parse('2026-11-17T12:00:00Z')

describe('readSmsAllowance', () => {
  it('ships off: null with no read while PRICING_V2 is off', async () => {
    expect(PRICING_V2).toBe(false)
    const f = fakeDb({ plan: 'essentials', homes: 40, texts: 100 })
    expect(await readSmsAllowance(f.db, 'org-1', { now: NOW })).toBeNull()
    expect(await smsAllowanceGate(f.db, 'org-1', { now: NOW })).toBeNull()
    expect(f.from).not.toHaveBeenCalled()
  })

  it('null for orgs not on the new plans (legacy, pilot, trial)', async () => {
    for (const plan of ['monthly', 'annual', 'pilot', 'free']) {
      const f = fakeDb({ plan, homes: 40, texts: 1000 })
      expect(await readSmsAllowance(f.db, 'org-1', { now: NOW, pricingV2: true })).toBeNull()
      expect(f.reads.map((r) => r.table)).toEqual(['orgs'])
    }
  })

  it('counts this UTC month’s sent texts for the org', async () => {
    const f = fakeDb({ plan: 'essentials', homes: 40, texts: 45 })
    const s = await readSmsAllowance(f.db, 'org-1', { now: NOW, pricingV2: true })
    expect(s).toMatchObject({ allowanceSegments: 100, usedSegments: 90, level: 'warning' })
    const q = f.reads.find((r) => r.table === 'communication_recipients')!
    expect(q.filters).toEqual([
      ['eq', 'organization_id', 'org-1'],
      ['eq', 'channel', 'sms'],
      ['gte', 'sent_at', '2026-11-01T00:00:00.000Z'],
      ['lt', 'sent_at', '2026-12-01T00:00:00.000Z'],
    ])
  })

  it('month range rolls over the year', () => {
    expect(utcMonthRange(Date.parse('2026-12-31T23:59:00Z'))).toEqual({
      start: '2026-12-01T00:00:00.000Z',
      end: '2027-01-01T00:00:00.000Z',
    })
  })
})

describe('smsAllowanceGate', () => {
  it('lets texts through until the allowance is used, then refuses', async () => {
    const f = fakeDb({ plan: 'essentials', homes: 40, texts: 46 }) // 92 of 100 → 8 left = 4 texts
    const gate = (await smsAllowanceGate(f.db, 'org-1', { now: NOW, pricingV2: true }))!
    expect([1, 2, 3, 4, 5, 6].map(() => gate.take())).toEqual([true, true, true, true, false, false])
  })

  it('at 100% refuses the first text', async () => {
    const f = fakeDb({ plan: 'complete', homes: 50, texts: 100 })
    const gate = (await smsAllowanceGate(f.db, 'org-1', { now: NOW, pricingV2: true }))!
    expect(gate.take()).toBe(false)
  })

  it('fails open on a read error, logging ids and codes only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fakeDb({ plan: 'essentials', homes: 40, textsError: true })
      expect(await smsAllowanceGate(f.db, 'org-1', { now: NOW, pricingV2: true })).toBeNull()
      const logged = JSON.stringify(spy.mock.calls)
      expect(logged).toContain('org-1')
      expect(logged).toContain('57014')
    } finally {
      spy.mockRestore()
    }
  })
})
