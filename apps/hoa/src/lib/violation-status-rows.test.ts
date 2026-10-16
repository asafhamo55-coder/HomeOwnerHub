import { describe, expect, it } from 'vitest'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import { readViolationStatusRows } from './violation-status-rows'

const rows = Array.from({ length: 1600 }, (_, i) => ({
  id: `v${String(i).padStart(5, '0')}`,
  org_id: 'org-1',
  deleted_at: null,
  status: i % 2 === 0 ? 'open' : 'cured',
}))

describe('readViolationStatusRows (BL-047)', () => {
  it('returns every violation past the 1000-row cap', async () => {
    const { db } = cappedFakeDb({ hoa_violations: rows })
    const r = await readViolationStatusRows(db, 'org-1')
    expect(r.error).toBeNull()
    expect(r.data).toHaveLength(1600)
    expect(r.data!.filter((v) => v.status === 'open')).toHaveLength(800)
  })

  it('a failed later page is an error with no rows — never a partial list', async () => {
    const { db } = cappedFakeDb({ hoa_violations: rows }, { failAt: { table: 'hoa_violations', from: 1000 } })
    const r = await readViolationStatusRows(db, 'org-1')
    expect(r.data).toBeNull()
    expect(r.error?.code).toBe('57014')
  })
})
