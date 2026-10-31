import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

const h = vi.hoisted(() => ({
  org: { id: 'org-1', name: 'Org' } as { id: string; name: string } | null,
  role: 'board' as string | null,
  client: null as unknown,
}))

vi.mock('@/lib/orgs', () => ({ getCurrentOrg: async () => h.org }))
vi.mock('@/lib/auth', () => ({ getCurrentUserRoleInOrg: async () => h.role }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => h.client }))
vi.mock('@/lib/property-events', () => ({
  logPropertyEvent: vi.fn(async () => ({ ok: true })),
  listPropertyEvents: vi.fn(),
}))
vi.mock('@/lib/accounting/guard', () => ({ BOARD_ONLY_DENIED: 'denied', requireBoardOrAdminForAction: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { bulkSetPropertyTenure, setPropertyTenure } from './index'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function seed() {
  return memorySupabase({
    hoa_properties: [
      { id: uuid(1), org_id: 'org-1', tenure: 'unknown' },
      { id: uuid(2), org_id: 'org-1', tenure: 'unknown' },
      { id: uuid(3), org_id: 'org-2', tenure: 'unknown' },
    ],
  })
}

beforeEach(() => {
  h.org = { id: 'org-1', name: 'Org' }
  h.role = 'board'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('bulkSetPropertyTenure', () => {
  it('rejects residents before touching any row', async () => {
    const m = seed()
    h.client = m.client
    h.role = 'resident'
    const r = await bulkSetPropertyTenure({ propertyIds: [uuid(1)], tenure: 'leased' })
    expect(r).toMatchObject({ ok: false })
    expect(m.rows('hoa_properties').every((p) => p.tenure === 'unknown')).toBe(true)
  })

  it('rejects a caller with no role in the org', async () => {
    h.client = seed().client
    h.role = null
    expect(await bulkSetPropertyTenure({ propertyIds: [uuid(1)], tenure: 'leased' })).toMatchObject({ ok: false })
  })

  it('never writes another org’s home and reports it as failed', async () => {
    const m = seed()
    h.client = m.client
    const r = await bulkSetPropertyTenure({ propertyIds: [uuid(1), uuid(3)], tenure: 'leased' })
    expect(r).toEqual({ ok: true, data: { updated: 1, failed: 1, failedIds: [uuid(3)] } })
    const byId = Object.fromEntries(m.rows('hoa_properties').map((p) => [p.id, p.tenure]))
    expect(byId[uuid(1)]).toBe('leased')
    expect(byId[uuid(3)]).toBe('unknown')
    expect(revalidatePath).toHaveBeenCalledWith('/properties')
    expect(revalidatePath).toHaveBeenCalledWith('/leases')
  })

  it('refuses more than 200 homes and writes nothing', async () => {
    const m = seed()
    h.client = m.client
    const ids = Array.from({ length: 201 }, (_, i) => uuid(i + 1))
    const r = await bulkSetPropertyTenure({ propertyIds: ids, tenure: 'leased' })
    expect(r).toMatchObject({ ok: false })
    expect(m.rows('hoa_properties').every((p) => p.tenure === 'unknown')).toBe(true)
  })

  it('accepts exactly 200', async () => {
    h.client = seed().client
    const ids = Array.from({ length: 200 }, (_, i) => uuid(i + 1))
    const r = await bulkSetPropertyTenure({ propertyIds: ids, tenure: 'leased' })
    expect(r).toMatchObject({ ok: true, data: { updated: 2, failed: 198 } })
  })

  it('Leased resolves the same waiting-list entries the single path does', async () => {
    const wl = () => [
      { id: 'w1', property_id: uuid(1), status: 'waiting' },
      { id: 'w2', property_id: uuid(2), status: 'waiting' },
    ]
    const props = () => [
      { id: uuid(1), org_id: 'org-1', tenure: 'owner_occupied' },
      { id: uuid(2), org_id: 'org-1', tenure: 'owner_occupied' },
    ]
    const single = memorySupabase({ hoa_properties: props(), lease_waiting_list: wl() })
    h.client = single.client
    await setPropertyTenure({ propertyId: uuid(1), tenure: 'leased' })
    await setPropertyTenure({ propertyId: uuid(2), tenure: 'leased' })

    const bulk = memorySupabase({ hoa_properties: props(), lease_waiting_list: wl() })
    h.client = bulk.client
    await bulkSetPropertyTenure({ propertyIds: [uuid(1), uuid(2)], tenure: 'leased' })

    const status = (m: typeof bulk) => m.rows('lease_waiting_list').map((r) => [r.id, r.status])
    expect(status(bulk)).toEqual([['w1', 'approved'], ['w2', 'approved']])
    expect(status(bulk)).toEqual(status(single))
  })
})
