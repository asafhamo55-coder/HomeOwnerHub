import { describe, expect, it } from 'vitest'
import { getCommunitySnapshot } from './queries'

interface TableResult {
  data?: unknown
  count?: number
}

/**
 * Table-keyed stand-in for the PostgREST builder. Keyed by table rather
 * than by call index because getCommunitySnapshot fires its first three
 * queries inside a Promise.all — an index-keyed fake would silently pair
 * the wrong rows with the wrong table if that array is ever reordered.
 */
function fakeDb(results: Record<string, TableResult>) {
  const seen: Array<{ table: string; filters: string[] }> = []

  return {
    from(table: string) {
      const filters: string[] = []
      seen.push({ table, filters })
      const result = results[table] ?? {}

      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push(`eq:${col}=${String(val)}`)
          return chain
        },
        is: (col: string, val: unknown) => {
          filters.push(`is:${col}=${String(val)}`)
          return chain
        },
        in: (col: string, vals: readonly unknown[]) => {
          filters.push(`in:${col}=${vals.join(',')}`)
          return chain
        },
        range: (from: number, to: number) => {
          filters.push(`range:${from}-${to}`)
          return chain
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data: result.data ?? [],
            count: result.count ?? 0,
            error: null,
          }).then(resolve),
      }
      return chain
    },
    _seen: seen,
  }
}

const ORG = 'org-1'

function props(...ids: string[]) {
  return { data: ids.map((id) => ({ id })) }
}
function residents(...propertyIds: string[]) {
  return {
    data: propertyIds.map((property_id, i) => ({ id: `r${i}`, property_id })),
  }
}

describe('getCommunitySnapshot', () => {
  it('counts current residents and derives occupancy from distinct properties', async () => {
    const db = fakeDb({
      hoa_properties: props('p1', 'p2', 'p3', 'p4'),
      // p1 houses three people, p2 one. p3 and p4 are empty.
      property_residents: residents('p1', 'p1', 'p1', 'p2'),
      associations: { data: [{ id: 'a1' }] },
      lease_waiting_list: { count: 2 },
    })

    const snap = await getCommunitySnapshot(ORG, db as never)

    expect(snap.residentCount).toBe(4)
    expect(snap.propertyCount).toBe(4)
    expect(snap.occupiedCount).toBe(2)
    expect(snap.occupiedPct).toBe(50)
    expect(snap.waitingListCount).toBe(2)
  })

  it('reports unknown occupancy — not 0% — when no properties are on file', async () => {
    const db = fakeDb({
      hoa_properties: props(),
      property_residents: residents(),
      associations: { data: [] },
    })

    const snap = await getCommunitySnapshot(ORG, db as never)

    expect(snap.occupiedPct).toBeNull()
    expect(snap.propertyCount).toBe(0)
    expect(snap.residentCount).toBe(0)
  })

  it('ignores residents whose property was soft-deleted, so occupancy cannot exceed 100%', async () => {
    const db = fakeDb({
      // p2 is soft-deleted, so it never comes back from hoa_properties...
      hoa_properties: props('p1'),
      // ...but its resident row is still on file.
      property_residents: residents('p1', 'p2'),
      associations: { data: [{ id: 'a1' }] },
      lease_waiting_list: { count: 0 },
    })

    const snap = await getCommunitySnapshot(ORG, db as never)

    expect(snap.residentCount).toBe(1)
    expect(snap.occupiedCount).toBe(1)
    expect(snap.occupiedPct).toBe(100)
  })

  it('skips the waiting-list query entirely when the org has no associations', async () => {
    const db = fakeDb({
      hoa_properties: props('p1'),
      property_residents: residents('p1'),
      associations: { data: [] },
    })

    const snap = await getCommunitySnapshot(ORG, db as never)

    expect(snap.waitingListCount).toBe(0)
    expect(db._seen.map((s) => s.table)).not.toContain('lease_waiting_list')
  })

  it('scopes every query to the org and counts only residents still in residence', async () => {
    const db = fakeDb({
      hoa_properties: props('p1'),
      property_residents: residents('p1'),
      associations: { data: [{ id: 'a1' }] },
      lease_waiting_list: { count: 5 },
    })

    await getCommunitySnapshot(ORG, db as never)

    const byTable = Object.fromEntries(db._seen.map((s) => [s.table, s.filters]))
    expect(byTable.hoa_properties).toEqual(
      expect.arrayContaining([`eq:org_id=${ORG}`, 'is:deleted_at=null']),
    )
    expect(byTable.property_residents).toEqual(
      expect.arrayContaining([
        `eq:organization_id=${ORG}`,
        'is:deleted_at=null',
        'is:moved_out_at=null',
      ]),
    )
    expect(byTable.associations).toEqual(
      expect.arrayContaining([`eq:organization_id=${ORG}`]),
    )
    expect(byTable.lease_waiting_list).toEqual(
      expect.arrayContaining(['in:association_id=a1', 'eq:status=waiting']),
    )
  })
})
