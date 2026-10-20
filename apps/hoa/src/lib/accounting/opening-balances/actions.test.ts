import { beforeEach, describe, expect, it, vi } from 'vitest'

// The server action is a public POST endpoint. A resident (or a caller
// with no org) is refused by the role gate before any client is created,
// so nothing is read, proposed or audited.

const h = vi.hoisted(() => ({
  role: 'resident' as 'admin' | 'board' | 'resident' | null,
  core: vi.fn(),
  admin: vi.fn(),
}))

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
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: h.admin }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('./core', () => ({ proposeOpeningCore: h.core }))

import { proposeOpeningBalances } from './actions'
import { ACCOUNTING_DENIED } from '../guard'

beforeEach(() => {
  h.core.mockReset()
  h.admin.mockReset()
})

describe('proposeOpeningBalances — gate', () => {
  it('refuses a resident before touching the database or the service role', async () => {
    h.role = 'resident'
    expect(await proposeOpeningBalances({})).toEqual({ ok: false, error: ACCOUNTING_DENIED })
    expect(h.core).not.toHaveBeenCalled()
    expect(h.admin).not.toHaveBeenCalled()
  })

  it('refuses a caller with no organization', async () => {
    h.role = null
    const r = await proposeOpeningBalances({})
    expect(r.ok).toBe(false)
    expect(h.core).not.toHaveBeenCalled()
  })

  it.each(['board', 'admin'] as const)('lets a %s through to the books', async (role) => {
    h.role = role
    await expect(proposeOpeningBalances({})).rejects.toThrow('reached the database')
  })
})
