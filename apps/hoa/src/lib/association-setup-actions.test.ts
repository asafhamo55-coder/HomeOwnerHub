import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { setUpAssociationCore } from './association-setup'
import { setUpAssociation } from './association-setup-actions'

const h = vi.hoisted(() => ({ role: 'admin' as 'admin' | 'board' | 'resident' | null }))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Willow Creek HOA' } },
  ),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => ({ fake: true })) }))
vi.mock('./association-setup', async (orig) => ({
  ...(await orig<typeof import('./association-setup')>()),
  setUpAssociationCore: vi.fn(async () => ({ ok: true, associationId: 'a1', created: true })),
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
      expect.objectContaining({ orgId: 'org-1', input: { name: 'Willow Creek', state: 'FL', type: 'hoa' } }),
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
