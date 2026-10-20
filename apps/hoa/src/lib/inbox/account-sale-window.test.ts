import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'America/New_York') }))

import { loadHomeAccount, saleWindowStart, scopeRequestsToSaleWindow } from './account-context'
import { buildAccountFragments } from './draft/account-fragments'

// BL-101 — after a recorded sale, the board's inbox (rail + reply draft)
// tells the home's residents only what the resident portal shows the
// buyer: charges due on or after the sale (lib/resident-sale-window.ts).
// Synthetic ids, dates and amounts only.

describe('saleWindowStart', () => {
  it('is the valid_from of a current ownership that began with a sale', () => {
    expect(saleWindowStart([{ valid_from: '2026-06-15T00:00:00Z', source: 'sale' }])).toBe('2026-06-15')
  })

  it('ignores ownerships that did not begin with a sale (imports, invites, manual entry)', () => {
    expect(saleWindowStart([{ valid_from: '2026-09-01', source: 'import' }])).toBeNull()
    expect(saleWindowStart([{ valid_from: '2026-09-01', source: null }])).toBeNull()
    expect(saleWindowStart([])).toBeNull()
  })

  it('takes the latest sale when several co-buyer rows are current', () => {
    expect(
      saleWindowStart([
        { valid_from: '2026-06-15', source: 'sale' },
        { valid_from: '2026-07-01', source: 'manual' },
        { valid_from: '2026-06-20', source: 'sale' },
      ]),
    ).toBe('2026-06-20')
  })
})

type Result = { data: unknown; error: unknown }

/** A thenable PostgREST stand-in: every filter is chainable, `await` yields the table's rows. */
function fakeDb(tables: Record<string, Result>) {
  const reads: string[] = []
  return {
    reads,
    from(table: string) {
      reads.push(table)
      const result = tables[table] ?? { data: [], error: null }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'is', 'or', 'order', 'not', 'neq', 'limit', 'ilike']) {
        chain[m] = () => chain
      }
      chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject)
      return chain
    },
  }
}

const NOW = new Date('2026-10-20T16:00:00Z')

const ledger = {
  assessments: {
    data: [
      // The seller's: due before the sale, still open on the lot.
      { id: 'a-seller', unit_id: 'unit-12', amount: 900, due_date: '2026-04-01', status: 'open', assessment_type: 'regular', memo_code: null },
      // The buyer's.
      { id: 'a-buyer', unit_id: 'unit-12', amount: 250, due_date: '2026-10-01', status: 'open', assessment_type: 'regular', memo_code: null },
    ],
    error: null,
  },
  payments: {
    data: [{ id: 'p-seller', unit_id: 'unit-12', assessment_id: null, amount: 400, paid_at: '2026-03-10T15:00:00Z', payment_method: 'check' }],
    error: null,
  },
}

describe('loadHomeAccount — the sale window', () => {
  it('leaves the seller’s charges, payments and plan out of a sold home', async () => {
    const db = fakeDb({
      ...ledger,
      ownerships: { data: [{ valid_from: '2026-06-15', source: 'sale' }], error: null },
      payment_plans: {
        data: [{ unit_id: 'unit-12', organization_id: 'org-1', status: 'active', installment_amount: 150, installment_count: 6, total_amount: 900, start_date: '2026-03-01', created_at: '2026-03-01' }],
        error: null,
      },
    })
    const home = await loadHomeAccount(db as never, 'org-1', 'unit-12', NOW)

    expect(home.chargesFrom).toBe('2026-06-15')
    expect(home.account!.balanceCents).toBe(25000)
    expect(home.account!.openChargeCount).toBe(1)
    expect(home.account!.openCharges.map((c) => c.dueDate)).toEqual(['2026-10-01'])
    expect(home.account!.lastPayment).toBeNull()
    expect(home.plan).toEqual({ visible: false })

    // …and so do the reply draft's acct: fragments.
    const { fragments } = buildAccountFragments(home)
    const text = JSON.stringify(fragments)
    expect(text).toContain('$250.00')
    expect(text).not.toContain('$900.00')
    expect(text).not.toContain('$1150.00')
    expect(text).not.toContain('2026-04-01')
    expect(text).not.toContain('$400.00')
    expect(fragments.find((f) => f.refId === 'acct:balance')!.text).toContain('Covers charges due from 2026-06-15')
    expect(fragments.some((f) => f.refId === 'acct:plan')).toBe(false)
  })

  it('keeps a plan that started after the sale', async () => {
    const db = fakeDb({
      ...ledger,
      ownerships: { data: [{ valid_from: '2026-06-15', source: 'sale' }], error: null },
      payment_plans: {
        data: [{ unit_id: 'unit-12', organization_id: 'org-1', status: 'active', installment_amount: 50, installment_count: 5, total_amount: 250, start_date: '2026-10-05', created_at: '2026-10-04' }],
        error: null,
      },
    })
    const home = await loadHomeAccount(db as never, 'org-1', 'unit-12', NOW)
    expect(home.plan.visible).toBe(true)
  })

  it('keeps the whole history when the current ownership did not begin with a sale', async () => {
    const db = fakeDb({ ...ledger, ownerships: { data: [{ valid_from: '2026-09-30', source: 'import' }], error: null } })
    const home = await loadHomeAccount(db as never, 'org-1', 'unit-12', NOW)
    expect(home.chargesFrom).toBeNull()
    expect(home.account!.balanceCents).toBe(115000)
    expect(home.account!.lastPayment).not.toBeNull()
    expect(buildAccountFragments(home).fragments.find((f) => f.refId === 'acct:balance')!.text).not.toContain('Covers charges')
  })

  it('fails closed: an ownership read error withholds the ledger and plan, never the full history', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = fakeDb({
      ...ledger,
      ownerships: { data: null, error: { code: '42501', message: 'denied' } },
      payment_plans: {
        data: [{ unit_id: 'unit-12', organization_id: 'org-1', status: 'active', installment_amount: 150, installment_count: 6, total_amount: 900, start_date: '2026-03-01', created_at: '2026-03-01' }],
        error: null,
      },
    })
    const home = await loadHomeAccount(db as never, 'org-1', 'unit-12', NOW)
    expect(home.account).toBeNull()
    expect(home.plan).toEqual({ visible: false })
    expect(home.degraded).toContain('ledger')
    expect(home.requests).not.toBeNull()
    expect(buildAccountFragments(home).degraded).toContain('account_ledger')
    // Ids and codes only in the log.
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/\$|2026-06/)
    spy.mockRestore()
  })

  const requests = {
    tickets: {
      data: [
        { id: 't-seller', unit_id: 'unit-12', category: 'maintenance', subject: 'Seller gate latch', status: 'closed', created_at: '2026-05-02T12:00:00Z', organization_id: 'org-1' },
        { id: 't-buyer', unit_id: 'unit-12', category: 'maintenance', subject: 'Buyer porch light', status: 'open', created_at: '2026-07-01T12:00:00Z', organization_id: 'org-1' },
      ],
      error: null,
    },
    arc_requests: {
      data: [
        { id: 'arc-seller', unit_id: 'unit-12', category: 'fence', summary: 'Seller fence', status: 'approved', board_response_at: '2026-04-20', submitted_at: '2026-04-01T12:00:00Z', organization_id: 'org-1' },
      ],
      error: null,
    },
  }

  it('leaves tickets and ARC applications filed before the sale out of the draft', async () => {
    const db = fakeDb({ ...ledger, ...requests, ownerships: { data: [{ valid_from: '2026-06-15', source: 'sale' }], error: null } })
    const home = await loadHomeAccount(db as never, 'org-1', 'unit-12', NOW)
    expect(home.requests!.tickets.map((t) => t.id)).toEqual(['t-buyer'])
    expect(home.requests!.arcApplications).toEqual([])
    const text = JSON.stringify(buildAccountFragments(home).fragments)
    expect(text).toContain('Buyer porch light')
    expect(text).not.toContain('Seller gate latch')
    expect(text).not.toContain('Seller fence')
  })

  it('keeps every request when the ownership did not begin with a sale', async () => {
    const db = fakeDb({ ...ledger, ...requests, ownerships: { data: [{ valid_from: '2026-09-30', source: 'manual' }], error: null } })
    const home = await loadHomeAccount(db as never, 'org-1', 'unit-12', NOW)
    expect(home.requests!.tickets).toHaveLength(2)
    expect(home.requests!.arcApplications).toHaveLength(1)
  })

  it('fails closed on requests too: an ownership read error drops every ticket and ARC application', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = fakeDb({ ...ledger, ...requests, ownerships: { data: null, error: { code: '42501', message: 'denied' } } })
    const home = await loadHomeAccount(db as never, 'org-1', 'unit-12', NOW)
    expect(home.requests!.tickets).toEqual([])
    expect(home.requests!.arcApplications).toEqual([])
    spy.mockRestore()
  })
})

describe('scopeRequestsToSaleWindow', () => {
  const base = {
    tickets: [
      { id: 'a', subject: 's', category: 'general', status: 'open', createdAt: '2026-06-14T23:00:00Z', home: null },
      { id: 'b', subject: 's', category: 'general', status: 'open', createdAt: '2026-06-15T00:30:00Z', home: null },
    ],
    arcApplications: [{ id: 'c', summary: 's', category: 'fence', status: 'pending', submittedAt: '2026-06-15', decidedAt: null }],
    violationsOnMyHome: [{ id: 'v', type: 'trash', status: 'open', fineCents: null, curePeriodDays: 14, noticeSentAt: null, createdAt: '2026-01-01' }],
    reportedConcerns: [],
  }

  it('is the identity without a window', () => {
    expect(scopeRequestsToSaleWindow(base as never, null)).toBe(base)
  })

  it('keeps requests from the sale day on, and every open violation (they run with the lot)', () => {
    const out = scopeRequestsToSaleWindow(base as never, '2026-06-15')
    expect(out.tickets.map((t) => t.id)).toEqual(['b'])
    expect(out.arcApplications.map((a) => a.id)).toEqual(['c'])
    expect(out.violationsOnMyHome.map((v) => v.id)).toEqual(['v'])
  })
})
