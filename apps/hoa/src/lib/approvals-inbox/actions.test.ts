import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-048: the /approvals decision endpoint and the vendor module's new
// reject action are public POST endpoints. A resident must be refused
// before any Supabase client exists — not by RLS after the fact.

const h = vi.hoisted(() => ({ role: 'resident' as 'admin' | 'board' | 'resident' | null }))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    throw new Error('reached the database')
  }),
}))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('reached the service role')
  }),
}))
vi.mock('@/lib/orgs', () => ({
  getCurrentOrg: vi.fn(async () => {
    throw new Error('reached the database')
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('@homeowner-portal/workflows', () => ({ approveRequest: vi.fn(), rejectRequest: vi.fn(), vendorOnboarder: {} }))

import { createAdminClient } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { BOARD_ONLY_DENIED } from '@/lib/accounting/guard'
import { decideApproval } from './actions'
import { rejectVendor } from '@/lib/vendors'

const ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  h.role = 'resident'
  vi.mocked(getSupabaseServerClient).mockClear()
  vi.mocked(createAdminClient).mockClear()
})

describe('decideApproval refuses a resident before touching the database', () => {
  for (const kind of ['w18', 'bill', 'w3', 'vendor'] as const) {
    for (const decision of ['approve', 'reject'] as const) {
      it(`${kind} ${decision}`, async () => {
        expect(await decideApproval({ kind, id: ID, decision, reason: 'x' })).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
        expect(getSupabaseServerClient).not.toHaveBeenCalled()
        expect(createAdminClient).not.toHaveBeenCalled()
      })
    }
  }

  it('no session is refused too', async () => {
    h.role = null
    expect((await decideApproval({ kind: 'w3', id: ID, decision: 'approve' })).ok).toBe(false)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('a board member gets past the gate (control)', async () => {
    h.role = 'board'
    await expect(decideApproval({ kind: 'w3', id: ID, decision: 'approve' })).rejects.toThrow('reached the database')
  })
})

describe('rejectVendor (vendor module action)', () => {
  it('refuses a resident before touching the database', async () => {
    expect(await rejectVendor(ID, 'no license')).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('requires a reason', async () => {
    h.role = 'board'
    expect((await rejectVendor(ID, '   ')).ok).toBe(false)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })
})
