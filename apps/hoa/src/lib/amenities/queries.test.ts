import { describe, expect, it, vi } from 'vitest'
import { M11_APPLIED } from '@homeowner-portal/db/m11'
import { loadAmenities, loadHeldSlots, type LooseDb } from './queries'

// Amenity booking is live (M11_APPLIED = true): the default path reads the
// database, scoped to the organization. `live: false` is still the off path.

function chain(result: { data: unknown; error: { code?: string } | null }) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'gte', 'gt', 'lt', 'order', 'range']) q[m] = vi.fn(() => q)
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

  it('reads held times as one bounded query per amenity when given a window', async () => {
    const q = chain({ data: [{ amenity_id: 'a1', starts_at: '2026-11-14T19:00:00Z', ends_at: '2026-11-14T20:00:00Z' }], error: null })
    const db = { from: vi.fn(() => q) } as unknown as LooseDb
    const r = await loadHeldSlots(db, 'org-1', ['a1', 'a2'], '2026-11-02T00:00:00Z', true, '2027-01-01T00:00:00Z')
    expect(db.from).toHaveBeenCalledTimes(2)
    expect(q.lt).toHaveBeenCalledWith('starts_at', '2027-01-01T00:00:00Z')
    expect(r?.get('a1')?.length).toBe(2)
  })

  it('keeps the single unbounded read when no window is given', async () => {
    const q = chain({ data: [], error: null })
    const db = { from: vi.fn(() => q) } as unknown as LooseDb
    await loadHeldSlots(db, 'org-1', ['a1', 'a2'], '2026-11-02T00:00:00Z')
    expect(db.from).toHaveBeenCalledTimes(1)
    expect(q.lt).not.toHaveBeenCalled()
  })
})
