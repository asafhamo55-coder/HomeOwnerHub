import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-168 follow-up — GET /api/accounting/cpa-export: an active CPA only,
// flag-gated, every read on the CPA's OWN client and scoped to the org, the
// download audited with ids and codes only (a failed audit refuses it), and
// AR aging carries owner names and nothing else of the owner.

const PERIOD = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const UNIT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

type Row = { data: unknown; error: { code: string; message: string } | null }

const h = vi.hoisted(() => ({
  role: 'cpa' as string | null,
  m6: true,
  results: {} as Record<string, Row[]>,
  rpc: { data: [], error: null } as { data: unknown; error: { code: string; message: string } | null },
  auditError: null as { code: string; message: string } | null,
  audits: [] as Array<Record<string, unknown>>,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  clients: 0,
}))

vi.mock('@homeowner-portal/db/m6', () => ({
  get M6_APPLIED() {
    return h.m6
  },
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => (h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Maple HOA' } })),
}))

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table === 'audit_log') h.audits.push(row)
        return { error: h.auditError }
      },
    }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    h.clients += 1
    return {
      auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
      rpc: async (fn: string, args: unknown) => {
        h.calls.push({ table: `rpc:${fn}`, method: 'rpc', args: [args] })
        return h.rpc
      },
      from: (table: string) => {
        const chain: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'in', 'is', 'lte', 'order', 'range']) {
          chain[m] = (...args: unknown[]) => {
            h.calls.push({ table, method: m, args })
            return chain
          }
        }
        chain.maybeSingle = async () => (h.results[table]?.shift() ?? { data: null, error: null })
        chain.then = (resolve: (r: Row) => unknown) => Promise.resolve(h.results[table]?.shift() ?? { data: [], error: null }).then(resolve)
        return chain
      },
    }
  }),
}))

import { GET as rawGET } from './route'

const GET = (query = `kind=trial_balance&periodId=${PERIOD}`) => rawGET(new Request(`http://x/api/accounting/cpa-export?${query}`))
const period = { data: { id: PERIOD, association_id: 'assoc-1', start_date: '2026-01-01', end_date: '2026-12-31' }, error: null }

beforeEach(() => {
  h.role = 'cpa'
  h.m6 = true
  h.results = {}
  h.rpc = { data: [], error: null }
  h.auditError = null
  h.audits = []
  h.calls = []
  h.clients = 0
})

describe('GET /api/accounting/cpa-export: who may call it', () => {
  for (const role of ['resident', 'board', 'admin', 'attorney'] as const) {
    it(`a ${role} gets 403 before any client is made`, async () => {
      h.role = role
      const res = await GET()
      expect(res.status).toBe(403)
      expect((await res.json()).error.code).toBe('forbidden')
      expect(h.clients).toBe(0)
      expect(h.audits).toEqual([])
    })
  }

  it('no organization is 403 too (an expired CPA resolves to no role)', async () => {
    h.role = null
    const res = await GET()
    expect([401, 403]).toContain(res.status)
    expect(h.audits).toEqual([])
  })

  it('flag off: nothing is served, nothing is read, nothing is audited', async () => {
    h.m6 = false
    const res = await GET()
    expect(res.status).toBe(404)
    expect(h.calls).toEqual([])
    expect(h.audits).toEqual([])
  })

  it('a bad kind or period id is a 400 and reads nothing', async () => {
    expect((await GET(`kind=vendors&periodId=${PERIOD}`)).status).toBe(400)
    expect((await GET('kind=trial_balance&periodId=nope')).status).toBe(400)
    expect(h.calls).toEqual([])
  })
})

describe('GET /api/accounting/cpa-export: the files', () => {
  it('a period that is not this org’s is 404 and audits nothing', async () => {
    const res = await GET()
    expect(res.status).toBe(404)
    expect((await res.json()).error.reason).toBe('period_not_found')
    expect(h.audits).toEqual([])
    expect(h.calls).toContainEqual({ table: 'fiscal_periods', method: 'eq', args: ['organization_id', 'org-1'] })
  })

  it('trial balance: aggregates posted lines, scopes every read to the org, audits ids and counts', async () => {
    h.results = {
      fiscal_periods: [period],
      journal_entries: [{ data: [{ id: 'je-1' }], error: null }],
      ledger_entries: [
        {
          data: [
            { debit_amount: 100, credit_amount: 0, account: { id: 'a1', account_number: '1000', account_name: 'Operating cash', account_type: 'asset' } },
            { debit_amount: 0, credit_amount: 100, account: { id: 'a2', account_number: '4000', account_name: 'Assessments', account_type: 'income' } },
          ],
          error: null,
        },
      ],
    }
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('trial-balance-2026-12-31.csv')
    const csv = await res.text()
    expect(csv).toContain('1000,Operating cash,asset,100,0,100')
    expect(csv).toContain('4000,Assessments,income,0,100,100')
    for (const t of ['journal_entries', 'ledger_entries']) {
      expect(h.calls).toContainEqual({ table: t, method: 'eq', args: ['organization_id', 'org-1'] })
    }
    expect(h.calls).toContainEqual({ table: 'journal_entries', method: 'eq', args: ['status', 'posted'] })
    expect(h.audits).toEqual([
      { org_id: 'org-1', user_id: USER, action: 'pro.accounting_exported', entity_type: 'fiscal_period', entity_id: PERIOD, metadata: { kind: 'trial_balance', rows: 2 } },
    ])
  })

  it('general ledger detail: one row per posted line, with the entry and fund', async () => {
    h.results = {
      fiscal_periods: [period],
      journal_entries: [{ data: [{ id: 'je-1', entry_number: 'JE-7', entry_date: '2026-03-01', memo: 'Accrue insurance', source: 'manual' }], error: null }],
      ledger_entries: [
        {
          data: [
            { journal_entry_id: 'je-1', debit_amount: 50, credit_amount: 0, memo: null, account: { account_number: '6100', account_name: 'Insurance' }, fund: { code: 'OP' } },
            { journal_entry_id: 'je-1', debit_amount: 0, credit_amount: 50, memo: null, account: { account_number: '2000', account_name: 'Accrued' }, fund: { code: 'OP' } },
          ],
          error: null,
        },
      ],
    }
    const res = await GET(`kind=general_ledger&periodId=${PERIOD}`)
    expect(res.status).toBe(200)
    const csv = await res.text()
    expect(csv).toContain('2000,Accrued,2026-03-01,JE-7,manual,Accrue insurance,OP,0,50,')
    expect(csv).toContain('6100,Insurance,2026-03-01,JE-7,manual,Accrue insurance,OP,50,0,')
    expect(h.audits[0]!.metadata).toEqual({ kind: 'general_ledger', rows: 2 })
  })

  it('AR aging: owner names from the CPA-only function, buckets by days late, no contact details', async () => {
    h.results = {
      fiscal_periods: [period],
      assessments: [
        {
          data: [
            { unit_id: UNIT, due_date: '2026-12-31', amount: 100, payments: [] },
            { unit_id: UNIT, due_date: '2026-10-01', amount: 200, payments: [{ amount: 50, paid_at: '2026-11-01T12:00:00Z' }] },
          ],
          error: null,
        },
      ],
    }
    h.rpc = { data: [{ unit_id: UNIT, owner_name: 'Pat Owner' }], error: null }
    const res = await GET(`kind=ar_aging&periodId=${PERIOD}`)
    expect(res.status).toBe(200)
    const csv = await res.text()
    // Charge 1 is current ($100); charge 2 is 91 days late, $150 after the payment.
    expect(csv).toContain('Pat Owner,aaaaaaaa,100,0,0,0,150,250')
    expect(csv).not.toMatch(/@|phone|email|address/i)
    expect(h.calls).toContainEqual({ table: 'assessments', method: 'eq', args: ['organization_id', 'org-1'] })
    expect(h.calls).toContainEqual({ table: 'rpc:cpa_owner_names', method: 'rpc', args: [{ p_org_id: 'org-1' }] })
    expect(JSON.stringify(h.audits)).not.toContain('Pat Owner')
  })

  it('a failed read is the generic 500 and sends no partial file', async () => {
    h.results = {
      fiscal_periods: [period],
      journal_entries: [{ data: null, error: { code: '57014', message: 'timeout on journal_entries' } }],
    }
    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('journal_entries')
    expect(h.audits).toEqual([])
  })

  it('refuses the download when the audit row can’t be written', async () => {
    h.results = { fiscal_periods: [period] }
    h.auditError = { code: '42501', message: 'rls on audit_log' }
    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('audit_log')
  })
})
