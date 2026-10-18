import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type Recorded } from '@/lib/test-utils/fake-supabase'

// BL-081 actions. The association's day is pinned (todayIn mocked to
// 2026-10-18 for America/Los_Angeles) — no wall clock decides "past".

const RULE = 'aaaaaaaa-1111-4111-8111-111111111111'
const TPL = 'bbbbbbbb-2222-4222-8222-222222222222'
const ASSOC = 'assoc-1'
const ORG = 'org-1'
const USER = 'user-board'

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: 'board' | 'admin'; orgId: string } | { ok: false; error: string },
  client: null as unknown,
  today: vi.fn((_tz: string) => '2026-10-18'),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({ requireBoardOrAdminForAction: async () => h.gate }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1', name: 'Maple', timeZone: 'America/Los_Angeles' }) }))
vi.mock('@/lib/association-time', () => ({ todayIn: h.today }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => h.client }))

const { changeRecurringEntryState, updateRecurringEntry } = await import('./recurring-entries')

interface World {
  rule: { is_active: boolean; next_run_date: string; cadence: string } | null
  lifecycle: string | null
  failUpdate?: boolean
}

const TEMPLATE = {
  id: TPL,
  memo: 'Management fee',
  fiscal_period_id: 'fp-26',
  lines: [
    { account_id: 'mgmt-fee', fund_id: 'fund-op', debit_amount: 1250, credit_amount: 0, memo: null },
    { account_id: 'cash-op', fund_id: 'fund-op', debit_amount: 0, credit_amount: 1250, memo: 'paid from operating' },
  ],
}

function world(w: World) {
  const f = fakeSupabase((q: Recorded) => {
    const op = (m: string) => q.ops.some(([x]) => x === m)
    if (q.table === 'recurring_journal_entries' && op('update')) {
      return w.failUpdate ? { data: null, error: { code: '42501' } } : { data: [{ id: RULE }], error: null }
    }
    if (q.table === 'recurring_journal_entries') {
      return {
        data: w.rule ? { id: RULE, organization_id: ORG, association_id: ASSOC, template_je_id: TPL, ...w.rule } : null,
        error: null,
      }
    }
    if (q.table === 'audit_log' && op('insert')) return { data: null, error: null }
    if (q.table === 'audit_log') return { data: w.lifecycle ? [{ action: w.lifecycle, created_at: '2026-10-01T00:00:00Z' }] : [], error: null }
    if (q.table === 'journal_entries' && op('insert')) return { data: { id: 'new-template' }, error: null }
    if (q.table === 'journal_entries') return { data: TEMPLATE, error: null }
    if (q.table === 'ledger_entries') return { data: null, error: null }
    if (q.table === 'chart_of_accounts') {
      return {
        data: [
          { id: 'mgmt-fee', fund_id: null, is_active: true },
          { id: 'cash-op', fund_id: 'fund-op', is_active: true },
        ],
        error: null,
      }
    }
    if (q.table === 'funds') return { data: [{ id: 'fund-op' }], error: null }
    return undefined
  })
  ;(f.client as { auth: unknown }).auth = { getUser: async () => ({ data: { user: { id: USER } }, error: null }) }
  h.client = f.client
  return f.queries
}

const writes = (qs: Recorded[]) =>
  qs.filter((q) => q.ops.some(([m]) => m === 'insert' || m === 'update' || m === 'delete')).map((q) => ({ table: q.table, op: q.ops.find(([m]) => m === 'insert' || m === 'update' || m === 'delete')! }))

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: ORG }
  h.client = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('changeRecurringEntryState', () => {
  it('refuses a resident before touching the database', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can change accounting records.' }
    const r = await changeRecurringEntryState({ ruleId: RULE, action: 'pause' })
    expect(r).toEqual({ ok: false, error: 'Only board members and admins can change accounting records.' })
    expect(h.client).toBeNull()
  })

  it('pause: turns the rule off, then writes the audit row', async () => {
    const qs = world({ rule: { is_active: true, next_run_date: '2026-11-01', cadence: 'monthly' }, lifecycle: null })
    expect(await changeRecurringEntryState({ ruleId: RULE, action: 'pause' })).toEqual({ ok: true })
    const w = writes(qs)
    expect(w.map((x) => [x.table, x.op[0]])).toEqual([
      ['recurring_journal_entries', 'update'],
      ['audit_log', 'insert'],
    ])
    expect(w[0].op[1]).toEqual({ is_active: false })
    expect(w[1].op[1]).toMatchObject({ org_id: ORG, user_id: USER, action: 'recurring_je.paused', entity_type: 'recurring_journal_entry', entity_id: RULE })
  })

  it('stop: records the stop FIRST, then turns the rule off', async () => {
    const qs = world({ rule: { is_active: true, next_run_date: '2026-11-01', cadence: 'monthly' }, lifecycle: null })
    expect(await changeRecurringEntryState({ ruleId: RULE, action: 'stop' })).toEqual({ ok: true })
    expect(writes(qs).map((x) => [x.table, x.op[0]])).toEqual([
      ['audit_log', 'insert'],
      ['recurring_journal_entries', 'update'],
    ])
  })

  it('a stopped rule cannot be resumed', async () => {
    const qs = world({ rule: { is_active: false, next_run_date: '2026-11-01', cadence: 'monthly' }, lifecycle: 'recurring_je.stopped' })
    const r = await changeRecurringEntryState({ ruleId: RULE, action: 'resume', nextRunDate: '2026-11-01' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/was stopped/)
    expect(writes(qs)).toEqual([])
  })

  it('resume needs a next run on or after the association’s today', async () => {
    world({ rule: { is_active: false, next_run_date: '2026-09-01', cadence: 'monthly' }, lifecycle: 'recurring_je.paused' })
    const stale = await changeRecurringEntryState({ ruleId: RULE, action: 'resume' })
    expect(stale).toMatchObject({ ok: false, fieldErrors: { nextRunDate: 'Pick today or a later date.' } })
    expect(h.today).toHaveBeenCalledWith('America/Los_Angeles')

    const qs = world({ rule: { is_active: false, next_run_date: '2026-09-01', cadence: 'monthly' }, lifecycle: 'recurring_je.paused' })
    expect(await changeRecurringEntryState({ ruleId: RULE, action: 'resume', nextRunDate: '2026-10-18' })).toEqual({ ok: true })
    expect(writes(qs)[0].op[1]).toEqual({ is_active: true, next_run_date: '2026-10-18' })
  })

  it('a rule from another association is not found', async () => {
    const qs = world({ rule: null, lifecycle: null })
    expect(await changeRecurringEntryState({ ruleId: RULE, action: 'pause' })).toEqual({ ok: false, error: 'That recurring entry isn’t in this association.' })
    // The read itself is scoped to the association.
    expect(qs[0].ops).toContainEqual(['eq', 'association_id', ASSOC])
  })
})

const edit = (over: Partial<Parameters<typeof updateRecurringEntry>[0]> = {}) => ({
  ruleId: RULE,
  memo: 'Management fee',
  cadence: 'monthly',
  nextRunDate: '2026-11-01',
  lines: [
    { accountId: 'mgmt-fee', fundId: 'fund-op', debit: 1250, credit: 0 },
    { accountId: 'cash-op', fundId: 'fund-op', debit: 0, credit: 1250 },
  ],
  ...over,
})

describe('updateRecurringEntry', () => {
  const active = { rule: { is_active: true, next_run_date: '2026-11-01', cadence: 'monthly' }, lifecycle: null }

  it('a new amount saves a DRAFT template and points the rule at it — the posted template is never written', async () => {
    const qs = world(active)
    const r = await updateRecurringEntry(
      edit({
        lines: [
          { accountId: 'mgmt-fee', fundId: 'fund-op', debit: 1300, credit: 0 },
          { accountId: 'cash-op', fundId: 'fund-op', debit: 0, credit: 1300 },
        ],
      }),
    )
    expect(r).toEqual({ ok: true })
    const w = writes(qs)
    expect(w.map((x) => [x.table, x.op[0]])).toEqual([
      ['journal_entries', 'insert'],
      ['ledger_entries', 'insert'],
      ['recurring_journal_entries', 'update'],
      ['audit_log', 'insert'],
    ])
    expect(w[0].op[1]).toMatchObject({ status: 'draft', source: 'manual', entry_date: '2026-11-01', association_id: ASSOC })
    expect(String((w[0].op[1] as { entry_number: string }).entry_number)).toMatch(/^TPL-aaaaaaaa-/)
    // Line memos carry over by position.
    expect((w[1].op[1] as { memo: string | null }[]).map((l) => l.memo)).toEqual([null, 'paid from operating'])
    expect(w[2].op[1]).toEqual({ cadence: 'monthly', next_run_date: '2026-11-01', template_je_id: 'new-template' })
    expect(w[3].op[1]).toMatchObject({
      action: 'recurring_je.updated',
      metadata: { changed: ['lines'], previous_template_je_id: TPL, template_je_id: 'new-template', previous_total: 1250, total: 1300 },
    })
  })

  it('only a new date: no new template, the rule keeps its template', async () => {
    const qs = world(active)
    expect(await updateRecurringEntry(edit({ nextRunDate: '2026-12-01' }))).toEqual({ ok: true })
    const w = writes(qs)
    expect(w.map((x) => x.table)).toEqual(['recurring_journal_entries', 'audit_log'])
    expect(w[0].op[1]).toEqual({ cadence: 'monthly', next_run_date: '2026-12-01', template_je_id: TPL })
  })

  it('returns field errors and writes nothing for unbalanced lines or a past date', async () => {
    const qs = world(active)
    const r = await updateRecurringEntry(
      edit({
        nextRunDate: '2026-10-17',
        lines: [
          { accountId: 'mgmt-fee', fundId: 'fund-op', debit: 1300, credit: 0 },
          { accountId: 'cash-op', fundId: 'fund-op', debit: 0, credit: 1250 },
        ],
      }),
    )
    expect(r).toMatchObject({ ok: false, fieldErrors: { nextRunDate: 'Pick today or a later date.', lines: expect.stringMatching(/must be equal/) } })
    expect(writes(qs)).toEqual([])
  })

  it('refuses an account outside the association', async () => {
    world(active)
    const r = await updateRecurringEntry(
      edit({ lines: [{ accountId: 'elsewhere', fundId: 'fund-op', debit: 10, credit: 0 }, { accountId: 'cash-op', fundId: 'fund-op', debit: 0, credit: 10 }] }),
    )
    expect(r).toMatchObject({ ok: false, fieldErrors: { 'lines.0.account': expect.stringMatching(/chart of accounts/) } })
  })

  it('a stopped rule cannot be edited', async () => {
    const qs = world({ rule: { is_active: false, next_run_date: '2026-11-01', cadence: 'monthly' }, lifecycle: 'recurring_je.stopped' })
    const r = await updateRecurringEntry(edit())
    expect(r.ok).toBe(false)
    expect(writes(qs)).toEqual([])
  })

  it('if the rule update fails, the new draft template is removed', async () => {
    const qs = world({ ...active, failUpdate: true })
    const r = await updateRecurringEntry(edit({ memo: 'Management fee (new rate)' }))
    expect(r.ok).toBe(false)
    expect(writes(qs).map((x) => [x.table, x.op[0]])).toEqual([
      ['journal_entries', 'insert'],
      ['ledger_entries', 'insert'],
      ['recurring_journal_entries', 'update'],
      ['journal_entries', 'delete'],
    ])
  })
})
