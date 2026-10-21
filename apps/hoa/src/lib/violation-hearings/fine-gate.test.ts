import { describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

/**
 * BL-133 × BL-130 at the server action, with M4_APPLIED on: moving a
 * violation to Fined reads its hearing. A committee that did not approve
 * the fine blocks it; a hearing that meets the rule lets it through with
 * no warning-driven refusal; a failed hearing read refuses (never "none").
 */

const { state } = vi.hoisted(() => ({
  state: { db: null as null | ReturnType<typeof import('@/lib/test-utils/memory-supabase').memorySupabase> },
}))

vi.mock('@homeowner-portal/db/m4', () => ({ M4_APPLIED: true }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => ({ ok: true, role: 'board', orgId: ORG })),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => state.db!.client) }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: ORG, name: 'Fixture HOA' })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn(() => state.db!.client) }))
vi.mock('@homeowner-portal/db/violation-statuses', () => ({ VIOLATION_FINED_STATUS_LIVE: true }))

import { updateViolation, updateViolationStatus } from '@/lib/violations'

const ORG = '44444444-4444-4444-8444-444444444444'
const VIOLATION = '66666666-6666-4666-8666-666666666666'

const hearing = (extra: Record<string, unknown>) => ({
  id: 'h-1',
  organization_id: ORG,
  violation_id: VIOLATION,
  status: 'held',
  requested_at: null,
  resident_statement: null,
  hearing_on: '2026-11-20',
  hearing_time: '18:30',
  location: null,
  panel: [
    { name: 'A', role: 'member' },
    { name: 'B', role: 'member' },
    { name: 'C', role: 'member' },
  ],
  notice_sent_on: '2026-11-01',
  outcome: 'upheld',
  decided_on: '2026-11-20',
  findings_sent_on: '2026-11-24',
  payment_due_on: '2026-12-31',
  ...extra,
})

function db(
  hearings: Array<Record<string, unknown>>,
  failHearings = false,
  opts: { state?: string; status?: string; failRoster?: boolean } = {},
) {
  state.db = memorySupabase(
    {
      associations: [{ id: 'assoc-1', organization_id: ORG, name: 'Fixture HOA', state: opts.state ?? 'FL' }],
      hoa_violations: [{ id: VIOLATION, org_id: ORG, status: opts.status ?? 'notice_sent', fine_amount: 25 }],
      violation_hearings: hearings,
      org_members: [
        { org_id: ORG, user_id: 'u-board', role: 'board' },
        { org_id: ORG, user_id: 'u-res', role: 'resident' },
      ],
      profiles: [
        { id: 'u-board', full_name: 'Pat Director' },
        { id: 'u-res', full_name: 'Robin Owner' },
      ],
      audit_log: [],
    },
    failHearings
      ? { failOn: (c) => (c.table === 'violation_hearings' ? { code: '42P01', message: 'missing' } : null) }
      : opts.failRoster
        ? { failOn: (c) => (c.table === 'org_members' ? { code: '57014', message: 'timeout' } : null) }
        : undefined,
  )
}

const status = () => state.db!.rows('hoa_violations')[0]!.status

describe('updateViolationStatus → fined, with hearings on (FL)', () => {
  it('a committee that did not approve the fine blocks it; nothing is written', async () => {
    db([hearing({ outcome: 'dismissed', payment_due_on: null })])
    const res = await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })
    expect(res.ok).toBe(false)
    expect(state.db!.rows('hoa_violations')[0]!.status).toBe('notice_sent')
  })

  it('…unless the board records the attorney-advised override, which is audited first', async () => {
    db([hearing({ outcome: 'dismissed', payment_due_on: null })])
    const res = await updateViolationStatus({ violationId: VIOLATION, status: 'fined', lawOverrides: { fl_hearing_no_fine: 'attorney_advised' } })
    expect(res).toEqual({ ok: true })
    expect(state.db!.rows('audit_log')[0]).toMatchObject({ metadata: { overrides: [{ code: 'fl_hearing_no_fine', reason: 'attorney_advised' }] } })
  })

  it('an approved hearing that meets the rule: fined, no override row', async () => {
    db([hearing({})])
    expect(await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })).toEqual({ ok: true })
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })

  it('a failed hearing read refuses the fine', async () => {
    db([], true)
    const res = await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })
    expect(res.ok).toBe(false)
    expect(state.db!.rows('hoa_violations')[0]!.status).toBe('notice_sent')
  })
})

describe('BL-140: the fine hearing hard gate', () => {
  it('FL, no hearing recorded: blocked, nothing written', async () => {
    db([])
    const res = await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })
    expect(res.ok).toBe(false)
    expect(!res.ok && res.fieldErrors?.lawOverride).toBeTruthy()
    expect(status()).toBe('notice_sent')
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })

  it('FL, no hearing: only "attorney advised" lets it through, and it is audited first (codes only)', async () => {
    db([])
    const wrong = await updateViolationStatus({ violationId: VIOLATION, status: 'fined', lawOverrides: { fl_hearing_committee: 'governing_documents_allow' } })
    expect(wrong.ok).toBe(false)
    expect(status()).toBe('notice_sent')
    const res = await updateViolationStatus({ violationId: VIOLATION, status: 'fined', lawOverrides: { fl_hearing_committee: 'attorney_advised' } })
    expect(res).toEqual({ ok: true })
    expect(status()).toBe('fined')
    const audit = state.db!.rows('audit_log')
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ metadata: { step: 'fine', state: 'FL', overrides: [{ code: 'fl_hearing_committee', reason: 'attorney_advised' }] } })
    expect(JSON.stringify(audit[0])).not.toMatch(/Pat Director|Robin Owner/)
  })

  it.each([
    ['notice under 14 days', { notice_sent_on: '2026-11-10' }],
    ['no notice recorded', { notice_sent_on: null }],
    ['a director on the committee', { panel: [{ name: 'A', role: 'member' }, { name: 'B', role: 'member' }, { name: 'C', role: 'member' }, { name: 'D', role: 'board' }] }],
    ['only two committee members', { panel: [{ name: 'A', role: 'member' }, { name: 'B', role: 'member' }] }],
    ['the hearing not yet held', { status: 'scheduled', outcome: null, decided_on: null, findings_sent_on: null, payment_due_on: null }],
  ])('FL: %s blocks', async (_name, extra) => {
    db([hearing(extra)])
    expect((await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })).ok).toBe(false)
    expect(status()).toBe('notice_sent')
  })

  it('FL: a committee member marked as an owner who is on the board roster blocks', async () => {
    db([hearing({ panel: [{ name: 'A', role: 'member' }, { name: 'B', role: 'member' }, { name: 'director, pat', role: 'member' }] })])
    const res = await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })
    expect(res.ok).toBe(false)
    expect(status()).toBe('notice_sent')
  })

  it('FL: a resident (not on the roster) on the committee does not', async () => {
    db([hearing({ panel: [{ name: 'A', role: 'member' }, { name: 'B', role: 'member' }, { name: 'Robin Owner', role: 'member' }] })])
    expect(await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })).toEqual({ ok: true })
  })

  it('FL: a failed roster read refuses the fine (never "no conflicts")', async () => {
    db([hearing({})], false, { failRoster: true })
    const res = await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })
    expect(res.ok).toBe(false)
    expect(status()).toBe('notice_sent')
  })

  it('CA: no hearing blocks; a held hearing with 10 days’ notice passes', async () => {
    db([], false, { state: 'CA' })
    expect((await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })).ok).toBe(false)
    db([hearing({ panel: [], notice_sent_on: '2026-11-08' })], false, { state: 'CA' })
    expect(await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })).toEqual({ ok: true })
  })

  it('CA: 9 days’ notice blocks', async () => {
    db([hearing({ panel: [], notice_sent_on: '2026-11-11' })], false, { state: 'CA' })
    expect((await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })).ok).toBe(false)
  })

  it('TX: no hearing gate', async () => {
    db([], false, { state: 'TX' })
    expect(await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })).toEqual({ ok: true })
  })

  it('already fined with no hearing: raising the fine is blocked, lowering it is not', async () => {
    db([], false, { status: 'fined' })
    const up = await updateViolation({ violationId: VIOLATION, fineAmount: 50 })
    expect(up.ok).toBe(false)
    expect(state.db!.rows('hoa_violations')[0]!.fine_amount).toBe(25)
    expect(await updateViolation({ violationId: VIOLATION, fineAmount: 10 })).toEqual({ ok: true })
    expect(state.db!.rows('hoa_violations')[0]!.fine_amount).toBe(10)
  })
})
