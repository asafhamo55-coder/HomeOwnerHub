import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { assignUnassignedHomes } from './unassigned-homes'
import { assignUnassignedHomesAction } from './unassigned-homes-actions'

const h = vi.hoisted(() => ({ role: 'board' as 'admin' | 'board' | 'resident' | null }))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => (h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA' } })),
}))
vi.mock('@/lib/orgs', () => ({ getSignedInUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => ({ fake: true })) }))
vi.mock('./unassigned-homes', () => ({
  assignUnassignedHomes: vi.fn(async () => ({ ok: true, assigned: 3, audited: true })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}

beforeEach(() => {
  h.role = 'board'
  vi.clearAllMocks()
})

describe('assignUnassignedHomesAction (BL-125)', () => {
  it.each(['admin', 'board'] as const)('lets a %s assign to the association they picked, for their own org', async (role) => {
    h.role = role
    expect(await assignUnassignedHomesAction({}, form({ association_id: 'assoc-2' }))).toEqual({ assigned: 3 })
    expect(assignUnassignedHomes).toHaveBeenCalledWith(
      { fake: true },
      { orgId: 'org-1', associationId: 'assoc-2', userId: 'user-1', source: 'board_bulk_assign' },
    )
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('refuses a resident or a signed-out caller before touching the database', async () => {
    for (const role of ['resident', null] as const) {
      h.role = role
      expect((await assignUnassignedHomesAction({}, form({ association_id: 'assoc-1' }))).error).toBeTruthy()
    }
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('asks for an association when none was picked', async () => {
    expect((await assignUnassignedHomesAction({}, form({}))).error).toMatch(/association/i)
    expect(assignUnassignedHomes).not.toHaveBeenCalled()
  })

  it('surfaces a refusal (e.g. an association outside the org)', async () => {
    vi.mocked(assignUnassignedHomes).mockResolvedValueOnce({ ok: false, error: 'Choose an association from the list.' })
    expect(await assignUnassignedHomesAction({}, form({ association_id: 'x' }))).toEqual({
      error: 'Choose an association from the list.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
