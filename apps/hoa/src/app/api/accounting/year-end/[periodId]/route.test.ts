import { beforeEach, describe, expect, it, vi } from 'vitest'
import { unzipSync } from 'fflate'

// BL-121 — GET /api/accounting/year-end/[periodId]: gate first, the
// period must be the caller's association's, the export is audited with
// counts only, and a failed audit write refuses the download.

const PERIOD = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  ctx: { organizationId: 'org-1', associationId: 'assoc-1', associationName: 'Maple HOA', timeZone: 'America/New_York' } as Record<string, string> | null,
  period: { id: '11111111-1111-4111-8111-111111111111', start_date: '2025-01-01', end_date: '2025-12-31', status: 'closed' } as Record<string, string> | null,
  periodError: null as { code: string; message: string } | null,
  auditError: null as { code: string; message: string } | null,
  inserts: [] as Array<Record<string, unknown>>,
  loads: 0,
  clients: 0,
}))

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))

vi.mock('@/lib/accounting/queries', () => ({
  getAccountingContext: vi.fn(async () => h.ctx),
}))

vi.mock('@/lib/accounting/year-end/load', async () => {
  const { form1120HWorksheet } = await import('@/lib/accounting/year-end/model')
  return {
    loadYearEndData: vi.fn(async () => {
      h.loads += 1
      return {
        associationName: 'Maple HOA',
        fiscal: { start: '2025-01-01', end: '2025-12-31', status: 'closed' },
        calendarYear: 2025,
        trialBalance: { rows: [], totalDebits: 0, totalCredits: 0 },
        incomeStatement: { periodId: PERIOD, startDate: '', endDate: '', basis: 'accrual', income: [], expenses: [], totalIncome: 0, totalExpenses: 0, netIncome: 0 },
        balanceSheet: { asOfDate: '2025-12-31', assets: [], liabilities: [], equity: [], netIncomePtd: 0, totalAssets: 0, totalLiabilities: 0, totalEquity: 0, isBalanced: true },
        budgets: [],
        glLines: [],
        aging: { rows: [], totals: { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }, totalCents: 0 },
        bankRecs: [],
        vendorTotals: [
          { vendorId: 'v1', vendorName: 'Green Lawn LLC', dba: null, payments: 2, totalCents: 120_000, cardCents: 0, firstDay: '2025-01-02', lastDay: '2025-05-01' },
        ],
        nec: [
          { vendorId: 'v1', vendorName: 'Green Lawn LLC', dba: null, payments: 2, totalCents: 120_000, cardCents: 0, firstDay: '2025-01-02', lastDay: '2025-05-01', overHigherThreshold: false, w9OnFile: true, hasTin: true },
        ],
        worksheet: form1120HWorksheet({ income: [], totalExpenses: 0 }),
      }
    }),
  }
})

function builder() {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    maybeSingle: async () => ({ data: h.periodError ? null : h.period, error: h.periodError }),
    insert: async (row: Record<string, unknown>) => {
      h.inserts.push(row)
      return { error: h.auditError }
    },
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    h.clients += 1
    return {
      auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
      from: () => builder(),
    }
  }),
}))

import { GET as rawGET } from './route'

const GET = (periodId = PERIOD) =>
  rawGET(new Request(`http://x/api/accounting/year-end/${periodId}`), { params: Promise.resolve({ periodId }) })

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  h.ctx = { organizationId: 'org-1', associationId: 'assoc-1', associationName: 'Maple HOA', timeZone: 'America/New_York' }
  h.period = { id: PERIOD, start_date: '2025-01-01', end_date: '2025-12-31', status: 'closed' }
  h.periodError = null
  h.auditError = null
  h.inserts = []
  h.loads = 0
  h.clients = 0
})

describe('GET /api/accounting/year-end/[periodId]', () => {
  it('a resident gets 403 before anything is read', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can download the year-end package.' }
    const res = await GET()
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(h.clients).toBe(0)
    expect(h.loads).toBe(0)
  })

  it('a malformed period id is a 400', async () => {
    const res = await GET('not-a-uuid')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation_failed')
    expect(h.loads).toBe(0)
  })

  it("a period outside the caller's association is 404", async () => {
    h.period = null
    const res = await GET()
    expect(res.status).toBe(404)
    expect((await res.json()).error.reason).toBe('period_not_found')
    expect(h.loads).toBe(0)
  })

  it('a failed period read is the generic 500 with no raw text', async () => {
    h.periodError = { code: '57014', message: 'canceling statement due to statement timeout on fiscal_periods' }
    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('fiscal_periods')
  })

  it('refuses the download when the audit row cannot be written', async () => {
    h.auditError = { code: '42501', message: 'new row violates row-level security policy for table audit_log' }
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('internal')
    expect(JSON.stringify(body)).not.toContain('audit_log')
  })

  it('board gets the zip; the audit row holds counts only', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toContain('year-end-package-2025-12-31.zip')
    const entries = unzipSync(new Uint8Array(await res.arrayBuffer()))
    expect(Object.keys(entries)).toContain('1099-nec-candidates.csv')
    expect(Object.keys(entries)).toContain('README.txt')

    expect(h.inserts).toHaveLength(1)
    const audit = h.inserts[0]
    expect(audit).toMatchObject({
      action: 'year_end_package_export',
      org_id: 'org-1',
      user_id: USER,
      entity_type: 'fiscal_period',
      entity_id: PERIOD,
    })
    const meta = JSON.stringify(audit.metadata)
    expect(meta).not.toContain('Green Lawn')
    expect(meta).not.toContain('1200')
    expect((audit.metadata as { rows: Record<string, number> }).rows['1099-nec-candidates.csv']).toBe(1)
  })

  it('admin is allowed too', async () => {
    h.gate = { ok: true, role: 'admin', orgId: 'org-1' }
    const res = await GET()
    expect(res.status).toBe(200)
  })
})
