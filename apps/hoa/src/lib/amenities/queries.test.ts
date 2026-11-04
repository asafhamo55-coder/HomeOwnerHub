import { describe, expect, it, vi } from 'vitest'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { loadAmenities, type LooseDb } from './queries'

// Amenity booking is live (M11_APPLIED = true): the default path reads the
// database, scoped to the organization. `live: false` is still the off path.

function chain(result: { data: unknown; error: { code?: string } | null }) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'gte', 'order', 'range']) q[m] = vi.fn(() => q)
  q.then = (res: (v: unknown) => void) => res(result)
  return q
}

describe('amenity loaders with the flag on', () => {
  it('is switched on', () => {
    expect(M11_APPLIED).toBe(true)
  })

  it('reads the database by default, scoped to the organization', async () => {
    const amenitiesQ = chain({ data: [], error: null })
    const db = { from: vi.fn(() => amenitiesQ) } as unknown as LooseDb
    const r = await loadAmenities(db, 'org-1')
    expect(r).toEqual([])
    expect(db.from).toHaveBeenCalledWith('amenities')
    expect(amenitiesQ.eq).toHaveBeenCalledWith('organization_id', 'org-1')
  })

  it('returns null, not an empty list, when the read fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = { from: vi.fn(() => chain({ data: null, error: { code: 'x' } })) } as unknown as LooseDb
    expect(await loadAmenities(db, 'org-1')).toBeNull()
    spy.mockRestore()
  })

  it('touches nothing when asked to run in the off state', async () => {
    const db = { from: vi.fn() } as unknown as LooseDb
    expect(await loadAmenities(db, 'org-1', { live: false })).toEqual([])
    expect(db.from).not.toHaveBeenCalled()
  })
})
