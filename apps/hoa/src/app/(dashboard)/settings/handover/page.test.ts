import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

;(globalThis as { React?: typeof React }).React = React

// BL-117: /settings/handover is board/admin only. A resident (or anyone
// without a board role) is redirected before a single row is read.

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  loads: 0,
  adminClients: 0,
}))

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => {
    if (h.role === null) throw new Error('NEXT_REDIRECT:/onboarding')
    if (h.role === 'resident') throw new Error('NEXT_REDIRECT:/resident')
    return { role: h.role, org: { id: 'org-1', name: 'Maple HOA' } }
  }),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => ({ tag: 'user-client' })) }))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: vi.fn(() => {
    h.adminClients += 1
    return { tag: 'admin-client' }
  }),
}))
vi.mock('@/lib/handover/load', () => ({
  loadHandover: vi.fn(async (deps: { orgId: string; orgName: string }) => {
    h.loads += 1
    return { generatedAt: 'now', orgName: deps.orgName, orgId: deps.orgId, access: null, connections: null, openWork: null, exportTableCount: 0 }
  }),
}))
vi.mock('@/components/settings/SettingsTabs', () => ({ SettingsTabs: () => null }))
vi.mock('./HandoverKit', () => ({ HandoverKit: () => null }))

const { default: HandoverSettingsPage } = await import('./page')

beforeEach(() => {
  h.loads = 0
  h.adminClients = 0
})

describe('/settings/handover gate', () => {
  it('a resident is redirected and nothing is read', async () => {
    h.role = 'resident'
    await expect(HandoverSettingsPage()).rejects.toThrow('NEXT_REDIRECT:/resident')
    expect(h.loads).toBe(0)
    expect(h.adminClients).toBe(0)
  })

  it('signed out / no org is redirected too, nothing read', async () => {
    h.role = null
    await expect(HandoverSettingsPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(h.loads).toBe(0)
    expect(h.adminClients).toBe(0)
  })

  it.each(['board', 'admin'] as const)('%s gets the kit for their own org', async (role) => {
    h.role = role
    const el = (await HandoverSettingsPage()) as unknown as {
      props: { children: { props: { model: { orgId: string; orgName: string }; viewerRole: string } } }
    }
    expect(h.loads).toBe(1)
    expect(el.props.children.props.viewerRole).toBe(role)
    expect(el.props.children.props.model).toMatchObject({ orgId: 'org-1', orgName: 'Maple HOA' })
  })
})
