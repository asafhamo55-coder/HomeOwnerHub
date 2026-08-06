import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetCurrentOrg, mockGetRole, mockFrom } = vi.hoisted(() => ({
  mockGetCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'Madison Park' })),
  mockGetRole: vi.fn(async () => 'resident' as string),
  // Throws by default: reaching the database before the role check is
  // itself the defect these tests guard against. A test that needs a live
  // client overrides this explicitly.
  mockFrom: vi.fn(() => {
    throw new Error('must not query before checking the caller role')
  }),
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
    from: mockFrom,
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('./property-events', () => ({ logPropertyEvent: vi.fn(async () => ({ ok: true, id: 'e1' })) }))

import { removeResident, updateResident } from './property-residents'

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


describe('removeResident authorization', () => {
  it('refuses a caller whose role is resident', async () => {
    mockGetRole.mockResolvedValue('resident')

    const result = await removeResident('res-1')

    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to perform this action.",
    })
  })

  it('refuses before touching the database', async () => {
    // The supabase mock throws if `.from` is reached, so a role check that
    // ran AFTER the lookup would surface as a rejected promise, not this
    // clean refusal. Moving a resident out is a real state change — it
    // stamps moved_out_at and writes a resident_removed audit row — so it
    // must be gated as tightly as updateResident.
    mockGetRole.mockResolvedValue('resident')

    await expect(removeResident('res-1')).resolves.toMatchObject({ ok: false })
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('updateResident positive path', () => {
  it('lets a board caller through to the database', async () => {
    // Deferred from the original task: the negative-path tests alone could
    // pass with the role check hard-coded to always refuse.
    mockGetRole.mockResolvedValue('board')

    await expect(updateResident('res-1', { full_name: 'New Name' })).rejects.toThrow(
      /must not query before checking the caller role/,
    )
    expect(mockFrom).toHaveBeenCalled()
  })
})
