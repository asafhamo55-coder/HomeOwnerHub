import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetCurrentOrg, mockGetRole, mockFrom, mockRevalidate } = vi.hoisted(() => ({
  mockRevalidate: vi.fn(),
  mockGetCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'Madison Park' })),
  mockGetRole: vi.fn(async () => 'resident' as string),
  // Throws by default: reaching the database before the role check is
  // itself the defect these tests guard against. A test that needs a live
  // client overrides this explicitly.
  mockFrom: vi.fn((): unknown => {
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

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))
vi.mock('./property-events', () => ({ logPropertyEvent: vi.fn(async () => ({ ok: true, id: 'e1' })) }))

import { addResident, removeResident, updateResident } from './property-residents'

beforeEach(() => {
  mockGetRole.mockReset()
  // Without this the `not.toHaveBeenCalled` assertion below only holds
  // because the one test that reaches `.from` happens to run last.
  mockFrom.mockClear()
  mockRevalidate.mockClear()
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

describe('cross-org scoping on resident mutations', () => {
  it('scopes the removeResident lookup to the selected org', async () => {
    // getCurrentOrg() returns the SELECTED org, but RLS allows every org the
    // caller belongs to. A user who is `board` in org A and a plain
    // `resident` in org B would otherwise pass the gate and mutate B's
    // resident — and logPropertyEvent would file the audit row under A.
    mockGetRole.mockResolvedValue('board')
    const filters: Record<string, unknown> = {}
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val
          return chain
        },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r),
      }
      return chain
    })

    await removeResident('res-1')

    expect(filters.organization_id).toBe('org-1')
  })

  it('scopes the updateResident lookup to the selected org', async () => {
    mockGetRole.mockResolvedValue('board')
    const filters: Record<string, unknown> = {}
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val
          return chain
        },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r),
      }
      return chain
    })

    await updateResident('res-1', { full_name: 'New Name' })

    expect(filters.organization_id).toBe('org-1')
  })
})

describe('updateResident revalidation', () => {
  it('revalidates the open inbox thread as well as the property page', async () => {
    // The rail renders residents from getPropertyContext. Without an /inbox
    // revalidation, correcting a resident on the PROPERTY page leaves a
    // thread open beside it showing the old name and address until a hard
    // reload — the mirror of the gap the inbox action already closes.
    mockGetRole.mockResolvedValue('board')
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: {
            id: 'res-1',
            property_id: 'legacy-1',
            role: 'owner',
            moved_out_at: null,
            full_name: 'Old Name',
          },
          error: null,
        }),
        then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r),
      }
      return chain
    })

    await updateResident('res-1', { full_name: 'New Name' })

    expect(mockRevalidate).toHaveBeenCalledWith('/properties/legacy-1')
    expect(mockRevalidate).toHaveBeenCalledWith('/inbox')
  })
})

describe('addResident authorization', () => {
  it('refuses a caller whose role is resident', async () => {
    mockGetRole.mockResolvedValue('resident')

    const result = await addResident({
      propertyId: '11111111-1111-4111-8111-111111111111',
      fullName: 'New Person',
      role: 'owner',
    })

    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to perform this action.",
    })
  })

  it('refuses before touching the database', async () => {
    // Adding a resident is a real state change — it inserts a row and fires
    // a resident_added audit event — so it needs the same gate its sibling
    // mutations have.
    mockGetRole.mockResolvedValue('resident')

    await expect(
      addResident({ propertyId: '11111111-1111-4111-8111-111111111111', fullName: 'New Person', role: 'owner' }),
    ).resolves.toMatchObject({ ok: false })
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
