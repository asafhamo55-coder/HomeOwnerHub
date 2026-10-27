import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-175a L3: createApprovedViolation takes a property id and photo paths
// from the browser. Both must be proven to belong to the caller's org.

const insert = vi.fn()
const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/x' } }))
const checkOrgOwned = vi.fn(async (..._a: unknown[]) => 'owned')

vi.mock('@/lib/org-owned', () => ({ checkOrgOwned: (...a: unknown[]) => checkOrgOwned(...a) }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1' })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  requireBoardOrAdminForAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    storage: { from: () => ({ createSignedUrl }) },
    from: () => ({
      insert: (v: unknown) => {
        insert(v)
        return { select: () => ({ single: async () => ({ data: { id: 'v-1' }, error: null }) }) }
      },
    }),
  })),
}))

import { createApprovedViolation } from './violations'

const input = (photoStoragePaths: string[]) => ({
  propertyId: '11111111-1111-4111-8111-111111111111',
  description: 'Overgrown hedge',
  violationType: 'landscaping',
  ccrSection: null,
  severity: 'low' as const,
  curePeriodDays: 14,
  fineAmount: 25,
  aiDraftLetter: null,
  approvedLetter: 'Dear owner, please trim the hedge.',
  photoStoragePaths,
})

describe('createApprovedViolation tenant isolation', () => {
  beforeEach(() => {
    insert.mockClear()
    createSignedUrl.mockClear()
    checkOrgOwned.mockReset()
    checkOrgOwned.mockResolvedValue('owned')
  })

  it('refuses a photo path in another org before signing anything', async () => {
    const r = await createApprovedViolation(input(['org-2/secret.jpg']))
    expect(r.ok).toBe(false)
    expect(createSignedUrl).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses a traversal path that starts with the org prefix', async () => {
    const r = await createApprovedViolation(input(['org-1/../org-2/secret.jpg']))
    expect(r.ok).toBe(false)
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('refuses a property that is not in the org (org_id column)', async () => {
    checkOrgOwned.mockResolvedValue('not_found')
    const r = await createApprovedViolation(input(['org-1/a.jpg']))
    expect(r.ok).toBe(false)
    expect(checkOrgOwned).toHaveBeenCalledWith(
      'hoa_properties',
      '11111111-1111-4111-8111-111111111111',
      'org-1',
      { orgColumn: 'org_id' },
    )
    expect(createSignedUrl).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('creates the violation for an owned property and own-org photos', async () => {
    const r = await createApprovedViolation(input(['org-1/1-abc.jpg']))
    expect(r).toEqual({ ok: true, violationId: 'v-1' })
    expect(createSignedUrl).toHaveBeenCalledWith('org-1/1-abc.jpg', expect.any(Number))
  })
})
