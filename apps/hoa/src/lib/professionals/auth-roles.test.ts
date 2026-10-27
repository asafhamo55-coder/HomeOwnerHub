import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-168: requireBoardOrAdmin, requireRole and the resolved role with
// M6_APPLIED on and off. A professional is never "board".

const h = vi.hoisted(() => ({ m6: true, role: 'cpa' as string | null }))

vi.mock('@homeowner-portal/db/m6', () => ({
  get M6_APPLIED() {
    return h.m6
  },
}))
vi.mock('@/lib/orgs', () => ({
  getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 })),
  getMembershipRole: vi.fn(async () => h.role),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`)
  }),
}))

import { getCurrentUserRoleInOrg, requireBoardOrAdmin, requireProfessional, requireRole } from '../auth'

beforeEach(() => {
  h.m6 = true
  h.role = 'cpa'
})

describe('the resolved role', () => {
  it('resolves cpa and attorney only once M6 is applied', async () => {
    expect(await getCurrentUserRoleInOrg('org-1')).toBe('cpa')
    h.role = 'attorney'
    expect(await getCurrentUserRoleInOrg('org-1')).toBe('attorney')
    h.m6 = false
    expect(await getCurrentUserRoleInOrg('org-1')).toBeNull()
  })
  it('an unknown role is no role', async () => {
    h.role = 'auditor'
    expect(await getCurrentUserRoleInOrg('org-1')).toBeNull()
  })
})

describe('guards', () => {
  it('requireBoardOrAdmin sends a professional to their own home, never into the board tree', async () => {
    await expect(requireBoardOrAdmin()).rejects.toThrow('redirect:/pro')
    h.role = 'attorney'
    await expect(requireBoardOrAdmin()).rejects.toThrow('redirect:/pro')
  })
  it('requireBoardOrAdmin still admits board and admin, and sends a resident to the portal', async () => {
    h.role = 'board'
    await expect(requireBoardOrAdmin()).resolves.toMatchObject({ role: 'board' })
    h.role = 'admin'
    await expect(requireBoardOrAdmin()).resolves.toMatchObject({ role: 'admin' })
    h.role = 'resident'
    await expect(requireBoardOrAdmin()).rejects.toThrow('redirect:/resident')
  })
  it('requireRole admits only the listed roles', async () => {
    await expect(requireRole(['cpa'] as const)).resolves.toMatchObject({ role: 'cpa' })
    await expect(requireRole(['attorney'] as const)).rejects.toThrow('redirect:/pro')
    h.role = 'board'
    await expect(requireRole(['cpa'] as const)).rejects.toThrow('redirect:/')
  })
  it('requireProfessional admits either professional and no one else', async () => {
    await expect(requireProfessional()).resolves.toMatchObject({ role: 'cpa' })
    h.role = 'resident'
    await expect(requireProfessional()).rejects.toThrow('redirect:/resident')
  })
  it('with M6 off a professional row resolves to no role, so every guard sends them to onboarding', async () => {
    h.m6 = false
    await expect(requireBoardOrAdmin()).rejects.toThrow('redirect:/onboarding')
    await expect(requireProfessional()).rejects.toThrow('redirect:/onboarding')
  })
})
