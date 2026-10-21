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
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn() }))
vi.mock('@homeowner-portal/db/violation-statuses', () => ({ VIOLATION_FINED_STATUS_LIVE: true }))

import { updateViolationStatus } from '@/lib/violations'

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

function db(hearings: Array<Record<string, unknown>>, failHearings = false) {
  state.db = memorySupabase(
    {
      associations: [{ id: 'assoc-1', organization_id: ORG, name: 'Fixture HOA', state: 'FL' }],
      hoa_violations: [{ id: VIOLATION, org_id: ORG, status: 'notice_sent', fine_amount: 25 }],
      violation_hearings: hearings,
      audit_log: [],
    },
    failHearings ? { failOn: (c) => (c.table === 'violation_hearings' ? { code: '42P01', message: 'missing' } : null) } : undefined,
  )
}

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
