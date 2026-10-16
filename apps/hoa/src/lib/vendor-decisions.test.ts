import { describe, expect, it } from 'vitest'
import { queuedSupabase as fakeSupabase, payloadOf } from './test-utils/fake-supabase-queue'
import { rejectProspectVendor, type VendorDecisionDb } from './vendor-decisions'

const ORG = '00000000-0000-0000-0000-000000000001'
const VENDOR = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const err = { code: '42501', message: 'permission denied' }

const input = { orgId: ORG, vendorId: VENDOR, userId: USER, role: 'board' as const, reason: 'No contractor license on file.' }

describe('rejectProspectVendor', () => {
  it('moves a live prospect to inactive, conditionally, and audits the reason', async () => {
    const { db, calls } = fakeSupabase({
      vendors: [{ data: [{ id: VENDOR }], error: null }],
      audit_log: [{ data: null, error: null }],
    })
    expect(await rejectProspectVendor(db as unknown as VendorDecisionDb, input)).toEqual({ ok: true })

    expect(payloadOf(calls, 'vendors', 'update')).toEqual({ status: 'inactive' })
    const ops = calls[0].ops
    expect(ops).toContainEqual(['eq', ['id', VENDOR]])
    expect(ops).toContainEqual(['eq', ['organization_id', ORG]])
    expect(ops).toContainEqual(['eq', ['status', 'prospect']])
    expect(ops).toContainEqual(['is', ['deleted_at', null]])

    expect(payloadOf(calls, 'audit_log', 'insert')).toMatchObject({
      org_id: ORG,
      user_id: USER,
      action: 'vendor.rejected',
      entity_type: 'vendor',
      entity_id: VENDOR,
      metadata: { reason: 'No contractor license on file.', actor_role: 'board', previous_status: 'prospect' },
    })
  })

  it('refuses a vendor that is no longer a prospect, without auditing', async () => {
    const { db, calls } = fakeSupabase({ vendors: [{ data: [], error: null }] })
    const r = await rejectProspectVendor(db as unknown as VendorDecisionDb, input)
    expect(r.ok).toBe(false)
    expect(calls.some((c) => c.table === 'audit_log')).toBe(false)
  })

  it('a failed write is an error', async () => {
    const { db } = fakeSupabase({ vendors: [{ data: null, error: err }] })
    expect((await rejectProspectVendor(db as unknown as VendorDecisionDb, input)).ok).toBe(false)
  })

  it('a failed audit write does not undo or fail the rejection', async () => {
    const { db } = fakeSupabase({ vendors: [{ data: [{ id: VENDOR }], error: null }], audit_log: [] })
    expect(await rejectProspectVendor(db as unknown as VendorDecisionDb, input)).toEqual({ ok: true })
  })
})
