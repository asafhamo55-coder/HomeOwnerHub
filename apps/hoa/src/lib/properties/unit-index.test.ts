import { describe, expect, it } from 'vitest'
import { cappedFakeDb, rangesFor } from '@/lib/supabase/capped-fake-db'
import { unitPropertyIndex } from './resolve'

// Every unit of the org → its property, past PostgREST's 1000-row cap,
// so a list can attribute unit-keyed rows (ARC, payments, mail) to homes
// with one read instead of one per home.
describe('unitPropertyIndex', () => {
  const units = Array.from({ length: 2300 }, (_, i) => ({
    id: `u${String(i).padStart(5, '0')}`,
    organization_id: i < 2200 ? 'org-1' : 'org-2',
    legacy_hoa_property_id: i % 7 === 0 ? null : `p${i % 1500}`,
  }))

  it('maps every bridged unit of the org, paging to the end', async () => {
    const { db, calls } = cappedFakeDb({ units })
    const index = await unitPropertyIndex(db as never, 'org-1')
    const expected = units.filter((u) => u.organization_id === 'org-1' && u.legacy_hoa_property_id)
    expect(index.size).toBe(expected.length)
    expect(index.get('u00001' as never)).toBe('p1')
    expect(index.has('u00000' as never)).toBe(false)
    // 2200 rows at 1000 a page: three full pages and the empty one that ends it.
    expect(rangesFor(calls, 'units').length).toBe(4)
  })

  it('throws on a failed page rather than returning a partial index', async () => {
    const { db } = cappedFakeDb({ units }, { failAt: { table: 'units', from: 1000 } })
    await expect(unitPropertyIndex(db as never, 'org-1')).rejects.toThrow()
  })
})
