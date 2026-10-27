import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-175a L3: signedDownloadUrl is a server action; it must not sign a
// storage path outside the caller's org prefix.

const createSignedUrl = vi.fn(async (..._a: unknown[]) => ({ data: { signedUrl: 'https://signed.example/x' } }))
let org: { id: string } | null = { id: 'org-1' }

vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => org) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ storage: { from: () => ({ createSignedUrl }) } })),
}))

import { signedDownloadUrl } from './documents'

describe('signedDownloadUrl', () => {
  beforeEach(() => {
    createSignedUrl.mockClear()
    org = { id: 'org-1' }
  })

  it('signs a path inside the org prefix', async () => {
    expect(await signedDownloadUrl('org-1/bylaws.pdf')).toBe('https://signed.example/x')
  })

  it.each(['org-2/bylaws.pdf', 'org-1/../org-2/bylaws.pdf', 'bylaws.pdf'])(
    'returns null for %s without signing',
    async (p) => {
      expect(await signedDownloadUrl(p)).toBeNull()
      expect(createSignedUrl).not.toHaveBeenCalled()
    },
  )

  it('returns null when there is no org', async () => {
    org = null
    expect(await signedDownloadUrl('org-1/bylaws.pdf')).toBeNull()
  })
})
