import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

// BL-076 "Open next fiscal year": opening it never changes the current
// period before its first day (pinned clocks, explicit association zones),
// a second run changes nothing, only an admin can do it, it is audited
// without PII, and the budget draft can be saved once the year exists.

const h = vi.hoisted(() => ({
  role: 'admin' as 'admin' | 'board' | 'resident' | null,
  client: null as unknown,
  posted: [] as Array<{ fiscalPeriodId: string; entryDate: string }>,
  assoc: { id: 'assoc-1', name: 'Willow Creek', timeZone: 'America/New_York' },
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => (h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Willow Creek HOA' } })),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => h.client) }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => h.assoc }))
vi.mock('@/lib/primary-association', () => ({ getPrimaryAssociationResult: async () => ({ ok: true, data: h.assoc, count: null }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({
  loadAccountingRefs: async () => ({ acctAR: 'ar', acctAssessmentIncome: 'inc', fundOperating: 'op' }),
  postJournalEntry: vi.fn(async (_db: unknown, v: { fiscalPeriodId: string; entryDate: string }) => {
    h.posted.push({ fiscalPeriodId: v.fiscalPeriodId, entryDate: v.entryDate })
    return { ok: true, journalEntryId: `je-${h.posted.length}` }
  }),
}))

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { createDues } from '@/lib/assessments'
import { getAccountingContext } from './queries'
import { loadBudgetDraftInputs } from './budget-draft-data'
import { openNextFiscalYear } from './fiscal-year-actions'
import { OPEN_YEAR_ADMIN_ONLY, openNextFiscalYearCore } from './open-next-fiscal-year'

const DEV_TEXT = /pnpm|seed:|script|sql|23505|PGRST|undefined|null/i
const FY26 = { id: 'fy26', organization_id: 'org-1', association_id: 'assoc-1', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }

function seed(extra: Record<string, Array<Record<string, unknown>>> = {}, state = 'FL') {
  const mem = memorySupabase({
    associations: [{ id: 'assoc-1', organization_id: 'org-1', name: 'Willow Creek', state, slug: 'WC' }],
    fiscal_periods: [FY26],
    funds: [{ id: 'f-op', association_id: 'assoc-1', code: 'OPERATING', name: 'Operating Fund', fund_type: 'operating', is_active: true }],
    units: [{ id: '00000000-0000-4000-8000-0000000000a1', association_id: 'assoc-1', unit_number: '1' }],
    ...extra,
  })
  h.client = mem.client
  return mem
}

/** Pin "now" to an absolute instant; only Date is faked, so promises still run. */
function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

beforeEach(() => {
  h.role = 'admin'
  h.posted = []
  h.assoc = { id: 'assoc-1', name: 'Willow Creek', timeZone: 'America/New_York' }
})
afterEach(() => vi.useRealTimers())

const core = (client: unknown, today: string) =>
  openNextFiscalYearCore(client as never, { orgId: 'org-1', associationId: 'assoc-1', userId: 'user-1', today })

describe('openNextFiscalYearCore', () => {
  it('adds next year as an open period, following the yearly structure, and audits it without PII', async () => {
    const mem = seed()
    const res = await core(mem.client, '2026-10-18')
    expect(res).toMatchObject({ ok: true, created: 1, label: 'FY 2027' })
    const fy27 = mem.rows('fiscal_periods').find((p) => p.start_date === '2027-01-01')
    expect(fy27).toMatchObject({ end_date: '2027-12-31', status: 'open', organization_id: 'org-1', association_id: 'assoc-1' })
    const audit = mem.rows('audit_log')
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: 'fiscal_year_opened', org_id: 'org-1', user_id: 'user-1', entity_type: 'association', entity_id: 'assoc-1' })
    expect(JSON.stringify(audit[0].metadata)).not.toMatch(/Willow|@/)
    if (res.ok) {
      expect(res.message).toContain('FY 2027')
      expect(res.message).not.toMatch(DEV_TEXT)
    }
  })

  it('is idempotent: a second run adds nothing and writes no second audit row', async () => {
    const mem = seed()
    await core(mem.client, '2026-10-18')
    const again = await core(mem.client, '2026-10-18')
    expect(again).toMatchObject({ ok: true, created: 0, label: 'FY 2027' })
    if (again.ok) expect(again.message).toBe('FY 2027 is already open. Nothing was changed.')
    expect(mem.rows('fiscal_periods')).toHaveLength(2)
    expect(mem.rows('audit_log')).toHaveLength(1)
  })

  it('a concurrent click that loses on the unique key reads as already open', async () => {
    const mem = memorySupabase(
      { fiscal_periods: [FY26] },
      { failOn: (c) => (c.table === 'fiscal_periods' && c.op === 'insert' ? { code: '23505', message: 'duplicate key' } : null) },
    )
    expect(await core(mem.client, '2026-10-18')).toMatchObject({ ok: true, created: 0 })
    expect(mem.rows('audit_log')).toHaveLength(0)
  })

  it('failures say what happened in plain words', async () => {
    const empty = memorySupabase({})
    const none = await core(empty.client, '2026-10-18')
    expect(none.ok).toBe(false)
    if (!none.ok) expect(none.error).toMatch(/Open the books first/)

    const broken = memorySupabase({ fiscal_periods: [FY26] }, { failOn: (c) => (c.op === 'select' ? { code: 'XX000', message: 'boom' } : null) })
    const failed = await core(broken.client, '2026-10-18')
    expect(failed).toMatchObject({ ok: false })
    if (!failed.ok) expect(failed.error).not.toMatch(DEV_TEXT)
    expect(broken.rows('fiscal_periods')).toHaveLength(1)
  })
})

describe('openNextFiscalYear (gates)', () => {
  it.each(['board', 'resident'] as const)('refuses a %s before touching the database', async (role) => {
    h.role = role
    seed()
    const res = await openNextFiscalYear()
    expect(res.ok).toBe(false)
    if (!res.ok && role === 'board') expect(res.error).toBe(OPEN_YEAR_ADMIN_ONLY)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    h.role = null
    expect((await openNextFiscalYear()).ok).toBe(false)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('an admin opens the year after the one containing the ASSOCIATION’s today', async () => {
    // 2027-01-01 03:00 UTC = Dec 31 22:00 in New York: still FY 2026 there.
    at('2027-01-01T03:00:00Z')
    const mem = seed()
    const res = await openNextFiscalYear()
    expect(res).toMatchObject({ ok: true, created: 1, label: 'FY 2027' })
    expect(mem.rows('fiscal_periods').map((p) => p.start_date).sort()).toEqual(['2026-01-01', '2027-01-01'])
    expect(mem.rows('audit_log')[0]).toMatchObject({ user_id: 'user-1' })
  })
})

describe('the current period does not move until next year starts', () => {
  it('accounting context: FY 2026 stays current today, FY 2027 is current from Jan 1 in the association’s zone', async () => {
    const mem = seed({}, 'HI') // Pacific/Honolulu
    h.assoc = { ...h.assoc, timeZone: 'Pacific/Honolulu' }
    at('2026-10-18T18:00:00Z')
    await core(mem.client, '2026-10-18')
    expect((await getAccountingContext())?.currentPeriod?.start_date).toBe('2026-01-01')

    // Jan 1 05:00 UTC: already Jan 1 in New York, still Dec 31 19:00 in Honolulu.
    at('2027-01-01T05:00:00Z')
    expect((await getAccountingContext())?.currentPeriod?.start_date).toBe('2026-01-01')

    // Jan 1 10:00 UTC = Jan 1 00:00 in Honolulu.
    at('2027-01-01T10:00:00Z')
    expect((await getAccountingContext())?.currentPeriod?.start_date).toBe('2027-01-01')
  })

  it('dues post into this year while next year is open, and into next year from its first day', async () => {
    const mem = seed()
    await core(mem.client, '2026-10-18')
    const fy27 = mem.rows('fiscal_periods').find((p) => p.start_date === '2027-01-01')!
    const dues = { scope: 'all' as const, frequency: 'one_time' as const, assessmentType: 'regular' as const, amount: 100, firstDueDate: '2026-11-01' }

    at('2026-12-31T16:00:00Z') // Dec 31, 11am in New York
    expect(await createDues(dues)).toMatchObject({ ok: true })
    expect(h.posted.at(-1)).toEqual({ fiscalPeriodId: 'fy26', entryDate: '2026-12-31' })

    at('2027-01-01T15:00:00Z') // Jan 1, 10am in New York
    expect(await createDues({ ...dues, firstDueDate: '2027-01-15' })).toMatchObject({ ok: true })
    expect(h.posted.at(-1)).toEqual({ fiscalPeriodId: fy27.id, entryDate: '2027-01-01' })
  })
})

describe('budget draft once next year is open', () => {
  it('before: no year to save to; after: next year is the target and Save turns on', async () => {
    // This year already has its budget, so there is nowhere left to save a draft.
    const mem = seed({
      budgets: [{ id: 'b26', association_id: 'assoc-1', fund_id: 'f-op', status: 'approved', fiscal_period_id: 'fy26', fiscalPeriod: { start_date: '2026-01-01', end_date: '2026-12-31' }, budget_line_items: [], deleted_at: null }],
    })
    const before = await loadBudgetDraftInputs({ associationId: 'assoc-1', today: '2026-10-18', client: mem.client as never })
    expect(before.target).toBeNull()
    expect(before.nextYearMissing).toEqual({ startDate: '2027-01-01', endDate: '2027-12-31' })

    await core(mem.client, '2026-10-18')
    const fy27 = mem.rows('fiscal_periods').find((p) => p.start_date === '2027-01-01')!
    const after = await loadBudgetDraftInputs({ associationId: 'assoc-1', today: '2026-10-18', client: mem.client as never })
    expect(after.nextYearMissing).toBeNull()
    expect(after.target).toEqual({ id: fy27.id, startDate: '2027-01-01', endDate: '2027-12-31' })
    expect(after.targets.map((t) => t.id)).toEqual([fy27.id])
  })
})
