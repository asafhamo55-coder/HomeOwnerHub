import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))

const fromMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: fromMock,
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { assignThreadToVendor, quickCreateVendor } from './actions'

type Result = { data: unknown; error: unknown }

/**
 * A filter-aware chain. Every `.eq()` is recorded so a test can assert the
 * action actually scoped its query — a mock that ignored filters would pass
 * just as happily with `.eq('organization_id', …)` deleted, which is the
 * exact regression these tests exist to catch.
 */
function chainFor(row: Record<string, unknown> | null, filters: Record<string, unknown>) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      filters[col] = val
      return chain
    }),
    ilike: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async (): Promise<Result> => ({ data: row, error: null })),
    then: (resolve: (r: Result) => unknown) =>
      Promise.resolve({ data: row, error: null }).then(resolve),
  }
  return chain
}

beforeEach(() => {
  fromMock.mockReset()
})

describe('assignThreadToVendor', () => {
  it('refuses when the vendor belongs to another org', async () => {
    const vendorFilters: Record<string, unknown> = {}
    fromMock.mockImplementation((table: string) =>
      table === 'vendors' ? chainFor(null, vendorFilters) : chainFor({ id: 'thread-1' }, {}),
    )

    const result = await assignThreadToVendor('thread-1', 'vendor-from-other-org')

    expect(result).toEqual({ error: 'Vendor not found.' })
    // The refusal must come from an org-scoped lookup, not a bare id lookup.
    expect(vendorFilters.organization_id).toBe('org-1')
  })

  it('scopes the thread update to the caller org before writing', async () => {
    const threadFilters: Record<string, unknown> = {}
    fromMock.mockImplementation((table: string) =>
      table === 'vendors' ? chainFor({ id: 'vendor-1' }, {}) : chainFor({ id: 'thread-1' }, threadFilters),
    )

    const result = await assignThreadToVendor('thread-1', 'vendor-1')

    expect(result).toEqual({ ok: true })
    expect(threadFilters.organization_id).toBe('org-1')
  })
})

describe('quickCreateVendor', () => {
  it('blocks an exact duplicate email and returns the existing vendor id', async () => {
    fromMock.mockImplementation((table: string) =>
      table === 'vendors' ? chainFor({ id: 'existing-vendor' }, {}) : chainFor({ id: 'thread-1' }, {}),
    )

    const result = await quickCreateVendor('thread-1', {
      legalName: 'ABC Landscaping',
      primaryEmail: 'jose@abclandscaping.com',
    })

    expect(result).toMatchObject({ duplicateVendorId: 'existing-vendor' })
    expect('ok' in result).toBe(false)
  })

  it('rejects invalid input before touching the database', async () => {
    fromMock.mockImplementation(() => {
      throw new Error('must not query on invalid input')
    })

    const result = await quickCreateVendor('thread-1', { legalName: 'X' })

    expect('error' in result).toBe(true)
  })
})
