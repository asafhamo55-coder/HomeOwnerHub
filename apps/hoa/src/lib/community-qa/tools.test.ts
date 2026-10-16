import { describe, expect, it, vi } from 'vitest'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'

vi.mock('@homeowner-portal/workflows/W1', () => ({ queryGoverningDocs: vi.fn() }))

const { TOOL_BY_NAME } = await import('./tools')

/**
 * BL-047: the Q&A agent states these counts to a board member as facts.
 * The fake caps each response at 1000 rows like PostgREST's max_rows.
 */
const ORG = 'org-1'
const ctx = (db: unknown) => ({ db: db as never, orgId: ORG })
const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`

const props = Array.from({ length: 1700 }, (_, i) => ({
  id: id('p', i),
  org_id: ORG,
  deleted_at: null,
  tenure: i < 400 ? 'leased' : 'owner_occupied',
}))
const violations = Array.from({ length: 1300 }, (_, i) => ({
  id: id('v', i),
  org_id: ORG,
  deleted_at: null,
  status: i < 1100 ? 'open' : 'fined',
}))

describe('community Q&A count tools', () => {
  it('count_units_by_tenure counts every property', async () => {
    const { db } = cappedFakeDb({ hoa_properties: props })
    const r = await TOOL_BY_NAME.count_units_by_tenure!.execute({}, ctx(db))
    expect(r).toEqual({ owner_occupied: 1300, leased: 400, unknown: 0, total: 1700 })
  })

  it('count_open_violations counts every violation', async () => {
    const { db } = cappedFakeDb({ hoa_violations: violations })
    const r = await TOOL_BY_NAME.count_open_violations!.execute({}, ctx(db))
    expect(r).toEqual({ total: 1300, open: 1100, fined: 200 })
  })

  it('a failed later page throws instead of answering a smaller number', async () => {
    const { db } = cappedFakeDb({ hoa_properties: props }, { failAt: { table: 'hoa_properties', from: 1000 } })
    await expect(TOOL_BY_NAME.count_units_by_tenure!.execute({}, ctx(db))).rejects.toThrow(/57014/)
  })

  it('count_properties throws on a failed count instead of answering 0', async () => {
    const { db } = cappedFakeDb({ hoa_properties: props }, { failAt: { table: 'hoa_properties' } })
    await expect(TOOL_BY_NAME.count_properties!.execute({}, ctx(db))).rejects.toThrow(/57014/)
    const ok = cappedFakeDb({ hoa_properties: props })
    expect(await TOOL_BY_NAME.count_properties!.execute({}, ctx(ok.db))).toEqual({ total_properties: 1700 })
  })
})
