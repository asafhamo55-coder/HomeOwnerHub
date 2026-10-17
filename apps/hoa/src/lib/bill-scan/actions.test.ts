import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-059: editBillProposal is a public POST endpoint that ends in a
// service-role write to approval_requests. A resident (or no session) is
// refused before any Supabase client — user or service role — exists.

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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))

import { createAdminClient } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { BOARD_ONLY_DENIED } from '@/lib/accounting/guard'
import { editBillProposal } from './actions'

const ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  h.role = 'resident'
  vi.mocked(getSupabaseServerClient).mockClear()
  vi.mocked(createAdminClient).mockClear()
})

describe('editBillProposal gate', () => {
  it('refuses a resident before touching the database', async () => {
    expect(await editBillProposal({ approvalRequestId: ID })).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('refuses no session too', async () => {
    h.role = null
    expect((await editBillProposal({ approvalRequestId: ID })).ok).toBe(false)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('a board member gets past the gate (control)', async () => {
    h.role = 'board'
    await expect(editBillProposal({ approvalRequestId: ID })).rejects.toThrow('reached the database')
  })
})
