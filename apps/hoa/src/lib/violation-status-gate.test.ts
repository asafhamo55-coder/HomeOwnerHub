import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

/**
 * Fined / Dismissed are refused by hoa_violations_status_check (23514)
 * until migration 0066 part 5 is applied. Until VIOLATION_FINED_STATUS_LIVE
 * is flipped, the editor does not offer them and updateViolationStatus
 * refuses them with a friendly message, writing nothing.
 */

const { state } = vi.hoisted(() => ({
  state: {
    live: false,
    db: null as null | ReturnType<typeof import('@/lib/test-utils/memory-supabase').memorySupabase>,
  },
}))

vi.mock('@homeowner-portal/db/violation-statuses', () => ({
  get VIOLATION_FINED_STATUS_LIVE() {
    return state.live
  },
}))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => ({ ok: true, role: 'board', orgId: ORG })),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => state.db!.client) }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: ORG, name: 'Fixture HOA' })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn() }))

import { updateViolationStatus } from '@/lib/violations'
import {
  VIOLATION_STATUSES,
  VIOLATION_STATUS_NOT_LIVE,
  isViolationStatusLive,
  selectableViolationStatuses,
} from '@/lib/violation-statuses'

const ORG = '44444444-4444-4444-8444-444444444444'
const VIOLATION = '66666666-6666-4666-8666-666666666666'

beforeEach(() => {
  state.live = false
  state.db = memorySupabase({
    associations: [{ id: 'assoc-1', organization_id: ORG, name: 'Fixture HOA', state: 'FL' }],
    hoa_violations: [{ id: VIOLATION, org_id: ORG, status: 'notice_sent', fine_amount: 25 }],
    audit_log: [],
  })
})

describe('selectable statuses', () => {
  it('flag off: Fined and Dismissed are not offered', () => {
    expect(selectableViolationStatuses('notice_sent', false)).toEqual(['open', 'notice_sent', 'resolved'])
    expect(isViolationStatusLive('fined', false)).toBe(false)
    expect(isViolationStatusLive('dismissed', false)).toBe(false)
    expect(isViolationStatusLive('resolved', false)).toBe(true)
  })

  it('flag on: every status is offered', () => {
    expect(selectableViolationStatuses('notice_sent', true)).toEqual([...VIOLATION_STATUSES])
    expect(isViolationStatusLive('fined', true)).toBe(true)
  })

  it('keeps the current status in the list even when gated', () => {
    expect(selectableViolationStatuses('fined', false)).toEqual(['open', 'notice_sent', 'fined', 'resolved'])
  })

  it('defaults to the module flag (off here)', () => {
    expect(selectableViolationStatuses('open')).not.toContain('fined')
    expect(selectableViolationStatuses('open')).not.toContain('dismissed')
  })
})

describe('updateViolationStatus with the flag off', () => {
  it.each(['fined', 'dismissed'] as const)('refuses %s with a friendly message and writes nothing', async (status) => {
    const res = await updateViolationStatus({ violationId: VIOLATION, status })
    expect(res).toEqual({ ok: false, error: VIOLATION_STATUS_NOT_LIVE, fieldErrors: { status: VIOLATION_STATUS_NOT_LIVE } })
    expect(state.db!.rows('hoa_violations')[0]!.status).toBe('notice_sent')
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })

  it('still saves an allowed status', async () => {
    expect(await updateViolationStatus({ violationId: VIOLATION, status: 'resolved', resolutionNote: 'fixed' })).toEqual({ ok: true })
    expect(state.db!.rows('hoa_violations')[0]).toMatchObject({ status: 'resolved', resolution_note: 'fixed' })
  })
})

describe('updateViolationStatus with the flag on', () => {
  it('saves dismissed with its note', async () => {
    state.live = true
    expect(await updateViolationStatus({ violationId: VIOLATION, status: 'dismissed', resolutionNote: 'not a violation' })).toEqual({ ok: true })
    expect(state.db!.rows('hoa_violations')[0]).toMatchObject({ status: 'dismissed', resolution_note: 'not a violation' })
  })

  it('saves fined and starts the fine date (state law check passes for FL $25/day)', async () => {
    state.live = true
    expect(await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })).toEqual({ ok: true })
    const row = state.db!.rows('hoa_violations')[0]!
    expect(row.status).toBe('fined')
    expect(typeof row.fine_start_date).toBe('string')
  })
})
