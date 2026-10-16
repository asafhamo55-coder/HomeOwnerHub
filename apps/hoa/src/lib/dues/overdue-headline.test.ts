import { describe, expect, it } from 'vitest'
import { cappedFakeDb, rangesFor } from '@/lib/supabase/capped-fake-db'
import { loadOverdueHeadline } from './overdue-headline'

const TODAY = '2026-10-16'

function charges(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${String(i).padStart(5, '0')}`,
    association_id: 'assoc-1',
    deleted_at: null,
    status: 'open',
    amount: 100,
    due_date: i === 7 ? '2025-01-01' : '2026-09-01',
    unit_id: `u${i % 1200}`,
    payments: i % 2 === 0 ? [{ amount: 40 }] : [],
  }))
}

describe('loadOverdueHeadline — the /dues headline over every overdue charge (BL-047)', () => {
  it('sums all 2500 charges even though each response holds at most 1000', async () => {
    const { db, calls } = cappedFakeDb({ assessments: charges(2500) })
    const h = await loadOverdueHeadline(db, 'assoc-1', TODAY)
    // 1250 at $60 open + 1250 at $100. A single capped read summed 1000 rows ($80,000).
    expect(h.totalOverdue).toBe(1250 * 60 + 1250 * 100)
    expect(h.unitsBehind).toBe(1200)
    expect(h.oldestDue).toBe('2025-01-01')
    expect(rangesFor(calls, 'assessments').length).toBeGreaterThan(2)
  })

  it('keeps the predicate: not paid, not waived, due strictly before today', async () => {
    const rows = [
      ...charges(3),
      { ...charges(1)[0], id: 'paid', status: 'paid' },
      { ...charges(1)[0], id: 'waived', status: 'waived' },
      { ...charges(1)[0], id: 'today', due_date: TODAY },
      { ...charges(1)[0], id: 'other', association_id: 'assoc-2' },
    ]
    const { db } = cappedFakeDb({ assessments: rows })
    const h = await loadOverdueHeadline(db, 'assoc-1', TODAY)
    expect(h.totalOverdue).toBe(60 + 100 + 60)
  })

  it('a failed later page throws — never a partial total', async () => {
    const { db } = cappedFakeDb({ assessments: charges(2500) }, { failAt: { table: 'assessments', from: 1000 } })
    await expect(loadOverdueHeadline(db, 'assoc-1', TODAY)).rejects.toThrow(/overdue dues total failed \(57014\)/)
  })
})
