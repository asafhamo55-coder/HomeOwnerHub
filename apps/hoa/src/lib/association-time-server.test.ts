import { describe, expect, it } from 'vitest'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import { loadZoneIndex } from './association-time-server'
import { scopeTimeZone } from './association-zone-index'

describe('loadZoneIndex (BL-065)', () => {
  it('reads every association of the given orgs, past the 1000-row cap', async () => {
    const associations = [
      ...Array.from({ length: 1200 }, (_, i) => ({
        id: `a-${String(i).padStart(5, '0')}`,
        organization_id: 'org-1',
        name: `Zeta ${i}`,
        state: 'TX',
      })),
      { id: 'z-last', organization_id: 'org-1', name: 'Alpha', state: 'CA' },
      { id: 'other', organization_id: 'org-2', name: 'Other', state: 'HI' },
    ]
    const { db } = cappedFakeDb({ associations })
    const r = await loadZoneIndex(db, ['org-1', 'org-1'])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 'z-last' sorts after the first 1000 ids, and is the primary by name.
    expect(scopeTimeZone(r.index, 'org-1', 'z-last')).toBe('America/Los_Angeles')
    expect(scopeTimeZone(r.index, 'org-1', null)).toBe('America/Los_Angeles')
    // org-2 was not asked for.
    expect(scopeTimeZone(r.index, 'org-2', 'other')).toBe('America/New_York')
  })

  it('returns a failed read instead of guessing Eastern', async () => {
    const { db } = cappedFakeDb(
      { associations: [{ id: 'a', organization_id: 'org-1', name: 'A', state: 'CA' }] },
      { failAt: { table: 'associations', from: 0 } },
    )
    const r = await loadZoneIndex(db, ['org-1'])
    expect(r.ok).toBe(false)
  })

  it('no orgs: no read, an empty index', async () => {
    const { db, calls } = cappedFakeDb({})
    const r = await loadZoneIndex(db, [])
    expect(r.ok).toBe(true)
    expect(calls).toHaveLength(0)
  })
})
