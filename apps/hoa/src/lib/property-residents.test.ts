import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetCurrentOrg, mockGetRole } = vi.hoisted(() => ({
  mockGetCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'Madison Park' })),
  mockGetRole: vi.fn(async () => 'resident' as string),
}))

vi.mock('@/lib/orgs', () => ({
  getCurrentOrg: mockGetCurrentOrg,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRoleInOrg: mockGetRole,
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn(() => {
      throw new Error('updateResident must not query before checking the caller role')
    }),
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('./property-events', () => ({ logPropertyEvent: vi.fn(async () => ({ ok: true, id: 'e1' })) }))

import { updateResident } from './property-residents'

beforeEach(() => {
  mockGetRole.mockReset()
})

describe('updateResident authorization', () => {
  it('refuses a caller whose role is resident', async () => {
    mockGetRole.mockResolvedValue('resident')

    const result = await updateResident('res-1', { full_name: 'New Name' })

    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to perform this action.",
    })
  })

  it('refuses before touching the database', async () => {
    mockGetRole.mockResolvedValue('resident')

    // The supabase mock throws if `.from` is reached. A passing test proves
    // the role check runs before any query, not after.
    await expect(updateResident('res-1', { full_name: 'New Name' })).resolves.toMatchObject({
      ok: false,
    })
  })
})
