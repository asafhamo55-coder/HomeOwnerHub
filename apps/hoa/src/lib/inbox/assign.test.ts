import { beforeEach, describe, expect, it, vi } from 'vitest'

/** BL-101 A6 — assigning a thread writes the existing assigned_to, to board members only. */

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({ role: 'board' as const, org: { id: 'org-1', name: 'Madison Park' } })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const updates: unknown[] = []
const eqs: unknown[][] = []
let updated: { id: string } | null = { id: 'thread-1' }
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const chain: Record<string, unknown> = {
      update: vi.fn((values: unknown) => {
        updates.push(values)
        return chain
      }),
      eq: vi.fn((...args: unknown[]) => {
        eqs.push(args)
        return chain
      }),
      select: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: updated, error: null })),
    }
    return { from: vi.fn(() => chain) }
  }),
}))

const isAssignableMember = vi.fn(async () => true)
vi.mock('./assignees', () => ({ isAssignableMember: (...args: unknown[]) => isAssignableMember(...(args as [])) }))

import { assignThread } from './assign'

const THREAD = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'

describe('assignThread', () => {
  beforeEach(() => {
    updates.length = 0
    eqs.length = 0
    updated = { id: 'thread-1' }
    isAssignableMember.mockClear()
    isAssignableMember.mockImplementation(async () => true)
  })

  it('writes assigned_to, scoped to the caller’s org', async () => {
    expect(await assignThread(THREAD, MEMBER)).toEqual({ ok: true })
    expect(isAssignableMember).toHaveBeenCalledWith('org-1', MEMBER)
    expect(updates).toEqual([{ assigned_to: MEMBER }])
    expect(eqs).toContainEqual(['organization_id', 'org-1'])
    expect(eqs).toContainEqual(['id', THREAD])
  })

  it('unassigns with null, without a membership check', async () => {
    expect(await assignThread(THREAD, null)).toEqual({ ok: true })
    expect(isAssignableMember).not.toHaveBeenCalled()
    expect(updates).toEqual([{ assigned_to: null }])
  })

  it('refuses anyone who is not a board member or admin of this org, and writes nothing', async () => {
    isAssignableMember.mockImplementation(async () => false)
    const result = await assignThread(THREAD, MEMBER)
    expect('error' in result).toBe(true)
    expect(updates).toHaveLength(0)
  })

  it('refuses malformed ids and reports a thread outside the org as not found', async () => {
    expect('error' in (await assignThread('nope', MEMBER))).toBe(true)
    updated = null
    expect(await assignThread(THREAD, MEMBER)).toEqual({ error: 'Thread not found.' })
  })
})
