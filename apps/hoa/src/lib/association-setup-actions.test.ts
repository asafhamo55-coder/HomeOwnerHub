import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readPrimaryAssociation, setUpAssociationCore } from './association-setup'
import { openBooks, setUpAssociation } from './association-setup-actions'

const h = vi.hoisted(() => ({ role: 'admin' as 'admin' | 'board' | 'resident' | null }))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Willow Creek HOA' } },
  ),
}))
vi.mock('@/lib/orgs', () => ({ getSignedInUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => ({ fake: true })) }))
vi.mock('./association-setup', async (orig) => ({
  ...(await orig<typeof import('./association-setup')>()),
  setUpAssociationCore: vi.fn(async () => ({ ok: true, associationId: 'a1', created: true, adoptedHomes: 0 })),
  readPrimaryAssociation: vi.fn(async () => ({
    ok: true,
    data: { id: 'a1', name: 'Willow Creek', timeZone: 'America/New_York' },
    count: null,
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`)
  }),
}))

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}
const good = { name: 'Willow Creek', state: 'FL', type: 'hoa', return_to: '/accounting/coa' }

beforeEach(() => {
  h.role = 'admin'
  vi.clearAllMocks()
})

describe('setUpAssociation', () => {
  it.each(['board', 'resident'] as const)('refuses a %s before touching the database', async (role) => {
    h.role = role
    const res = await setUpAssociation({}, form(good))
    expect(res.error).toMatch(/admin/i)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    h.role = null
    expect((await setUpAssociation({}, form(good))).error).toBeTruthy()
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('returns field errors for bad input without writing', async () => {
    const res = await setUpAssociation({}, form({ name: 'x', state: 'ZZ' }))
    expect(res.fieldErrors?.name).toBeTruthy()
    expect(res.fieldErrors?.state).toBeTruthy()
    expect(setUpAssociationCore).not.toHaveBeenCalled()
  })

  it('sets up the association for the current org and returns to the page it came from', async () => {
    await expect(setUpAssociation({}, form(good))).rejects.toThrow('redirect:/accounting/coa')
    expect(setUpAssociationCore).toHaveBeenCalledWith(
      { fake: true },
      // userId: the audit row for adopted homes is written as the admin (BL-125).
      expect.objectContaining({ orgId: 'org-1', userId: 'user-1', input: { name: 'Willow Creek', state: 'FL', type: 'hoa' } }),
    )
    expect(revalidatePath).toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith('/accounting/coa')
  })

  it('surfaces a failed setup instead of redirecting', async () => {
    vi.mocked(setUpAssociationCore).mockResolvedValueOnce({ ok: false, error: 'nope' })
    expect(await setUpAssociation({}, form(good))).toEqual({ error: 'nope' })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('openBooks (BL-064)', () => {
  const back = { return_to: '/accounting/periods' }

  it.each(['board', 'resident'] as const)('refuses a %s before touching the database', async (role) => {
    h.role = role
    const res = await openBooks({}, form(back))
    expect(res.error).toMatch(/admin/i)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    h.role = null
    expect((await openBooks({}, form(back))).error).toBeTruthy()
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('opens the books of the org’s primary association, then returns to the page', async () => {
    await expect(openBooks({}, form(back))).rejects.toThrow('redirect:/accounting/periods')
    expect(readPrimaryAssociation).toHaveBeenCalledWith({ fake: true }, 'org-1')
    expect(setUpAssociationCore).toHaveBeenCalledWith(
      { fake: true },
      expect.objectContaining({ orgId: 'org-1', associationId: 'a1' }),
    )
    expect(vi.mocked(setUpAssociationCore).mock.calls[0]![1]).not.toHaveProperty('input')
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('says it could not check when the association read fails, without writing', async () => {
    vi.mocked(readPrimaryAssociation).mockResolvedValueOnce({ ok: false })
    const res = await openBooks({}, form(back))
    expect(res.error).toMatch(/couldn’t/i)
    expect(setUpAssociationCore).not.toHaveBeenCalled()
  })

  it('does not create an association when there is none', async () => {
    vi.mocked(readPrimaryAssociation).mockResolvedValueOnce({ ok: true, data: null, count: null })
    const res = await openBooks({}, form(back))
    expect(res.error).toMatch(/association/i)
    expect(setUpAssociationCore).not.toHaveBeenCalled()
  })

  it('surfaces a failed step instead of redirecting', async () => {
    vi.mocked(setUpAssociationCore).mockResolvedValueOnce({ ok: false, error: 'nope', associationId: 'a1' })
    expect(await openBooks({}, form(back))).toEqual({ error: 'nope' })
    expect(redirect).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalled()
  })
})
