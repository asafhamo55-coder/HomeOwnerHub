import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  gate: vi.fn(),
  fill: vi.fn(),
  remove: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: h.gate,
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser: h.getUser } }),
}))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: async () => 'America/New_York' }))
vi.mock('./core', () => ({ fillSampleCommunity: h.fill, removeSampleCommunity: h.remove }))

import { addSampleCommunity, removeSampleData } from './actions'

beforeEach(() => {
  vi.resetAllMocks()
  h.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('sample community actions: who may call them', () => {
  const denied = { ok: false, error: 'Only board members and admins can make this change.' }

  it('refuses a resident before touching any data', async () => {
    h.gate.mockResolvedValue(denied)
    expect(await addSampleCommunity()).toEqual(denied)
    expect(await removeSampleData()).toEqual(denied)
    expect(h.fill).not.toHaveBeenCalled()
    expect(h.remove).not.toHaveBeenCalled()
  })

  it('lets a board member or admin fill, scoped to the org the gate named', async () => {
    h.gate.mockResolvedValue({ ok: true, role: 'board', orgId: 'org-A' })
    h.fill.mockResolvedValue({ ok: true, homes: 12 })
    const r = await addSampleCommunity()
    expect(r.ok).toBe(true)
    expect(h.fill.mock.calls[0]![1]).toMatchObject({ orgId: 'org-A', userId: 'u1' })
  })

  it('passes the refusal through when real homes exist', async () => {
    h.gate.mockResolvedValue({ ok: true, role: 'admin', orgId: 'org-A' })
    h.fill.mockResolvedValue({ ok: false, error: 'You already have homes in your account, so the sample community is not available.' })
    const r = await addSampleCommunity()
    expect(r.ok).toBe(false)
  })

  it('removal is scoped to the gate org', async () => {
    h.gate.mockResolvedValue({ ok: true, role: 'admin', orgId: 'org-B' })
    h.remove.mockResolvedValue({ ok: true, removedHomes: 12 })
    expect((await removeSampleData()).ok).toBe(true)
    expect(h.remove.mock.calls[0]![1]).toBe('org-B')
  })

  it('does not fill when nobody is signed in', async () => {
    h.gate.mockResolvedValue({ ok: true, role: 'board', orgId: 'org-A' })
    h.getUser.mockResolvedValue({ data: { user: null } })
    expect((await addSampleCommunity()).ok).toBe(false)
    expect(h.fill).not.toHaveBeenCalled()
  })
})
