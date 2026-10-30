import { describe, expect, it, vi } from 'vitest'
import { buildLedger, sameDayLastYear, statementBetween, statementWindow } from '@/lib/resident-ledger'
import { parseDay, resolveStatementRange } from './window'
import { loadOwnerStatement } from './load'
import { asPropertyId } from '../resolve'

const ledger = buildLedger(
  [
    { id: 'a1', unit_id: 'u', amount: 100, due_date: '2025-01-01', status: 'open', assessment_type: 'regular', memo_code: null },
    { id: 'a2', unit_id: 'u', amount: 100, due_date: '2025-03-01', status: 'open', assessment_type: 'regular', memo_code: null },
    { id: 'a3', unit_id: 'u', amount: 40.1, due_date: '2025-05-01', status: 'open', assessment_type: 'regular', memo_code: null },
  ],
  [{ id: 'p1', unit_id: 'u', assessment_id: 'a1', amount: 100, paid_at: '2025-01-10T15:00:00Z', payment_method: 'check' }],
  'America/New_York',
)

describe('statementBetween', () => {
  it('without an end date is exactly the resident statementWindow', () => {
    expect(statementBetween(ledger, '2025-02-01')).toEqual(statementWindow(ledger, '2025-02-01'))
    expect(statementBetween(ledger, '2025-02-01', null)).toEqual(statementWindow(ledger, '2025-02-01'))
  })

  it('closes at the balance on the end date and carries the opening balance', () => {
    const w = statementBetween(ledger, '2025-02-01', '2025-03-31')
    expect(w.openingBalance).toBe(0)
    expect(w.entries.map((e) => e.id)).toEqual(['a2'])
    expect(w.closingBalance).toBe(100)
    expect(w.totals).toEqual({ charges: 100, payments: 0, credits: 0 })
  })

  it('includes entries dated on both boundary days', () => {
    const w = statementBetween(ledger, '2025-03-01', '2025-05-01')
    expect(w.entries.map((e) => e.date)).toEqual(['2025-03-01', '2025-05-01'])
    expect(w.closingBalance).toBe(140.1)
  })

  it('a window before any activity closes at zero', () => {
    const w = statementBetween(ledger, '2024-01-01', '2024-12-31')
    expect(w.entries).toEqual([])
    expect(w.closingBalance).toBe(0)
  })
})

describe('resolveStatementRange', () => {
  it('defaults to the 12 months ending today', () => {
    expect(resolveStatementRange({}, '2025-10-01')).toEqual({ from: '2024-10-01', to: '2025-10-01' })
  })
  it('uses valid from and to', () => {
    expect(resolveStatementRange({ from: '2025-01-01', to: '2025-03-31' }, '2025-10-01')).toEqual({ from: '2025-01-01', to: '2025-03-31' })
  })
  it('swaps an inverted pair', () => {
    expect(resolveStatementRange({ from: '2025-06-01', to: '2025-01-01' }, '2025-10-01')).toEqual({ from: '2025-01-01', to: '2025-06-01' })
  })
  it('a lone from runs to today; a lone to starts a year earlier', () => {
    expect(resolveStatementRange({ from: '2025-01-01' }, '2025-10-01')).toEqual({ from: '2025-01-01', to: '2025-10-01' })
    expect(resolveStatementRange({ to: '2025-03-31' }, '2025-10-01')).toEqual({ from: '2024-03-31', to: '2025-03-31' })
  })
  it('rejects impossible dates and junk', () => {
    expect(parseDay('2025-02-30')).toBeNull()
    expect(parseDay('2025-13-01')).toBeNull()
    expect(parseDay('0000-01-01')).toBeNull()
    expect(parseDay('x')).toBeNull()
    expect(parseDay(undefined)).toBeNull()
    expect(parseDay('2024-02-29')).toBe('2024-02-29')
  })
  it('leap day falls back to Feb 28', () => {
    expect(sameDayLastYear('2024-02-29')).toBe('2023-02-28')
  })
})

describe('loadOwnerStatement cross-org denial', () => {
  it('returns null and reads no ledger when the home is not in the org', async () => {
    const tables: string[] = []
    const eqs: Array<[string, unknown]> = []
    const chain = (table: string): any => {
      tables.push(table)
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => (eqs.push([c, v]), q),
        is: () => q,
        in: () => q,
        or: () => q,
        gt: () => q,
        order: () => q,
        limit: () => q,
        range: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
      }
      return q
    }
    const supabase = { from: vi.fn(chain) } as never
    const out = await loadOwnerStatement(supabase, 'org-A', asPropertyId('11111111-1111-4111-8111-111111111111'))
    expect(out).toBeNull()
    expect(eqs).toContainEqual(['org_id', 'org-A'])
    expect(tables).not.toContain('assessments')
    expect(tables).not.toContain('payments')
  })

  it('throws on a failed property read rather than showing an empty statement', async () => {
    const q: any = {
      select: () => q,
      eq: () => q,
      is: () => q,
      in: () => q,
      order: () => q,
      limit: () => q,
      range: () => q,
      maybeSingle: async () => ({ data: null, error: { code: '42501' } }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
    }
    await expect(
      loadOwnerStatement({ from: () => q } as never, 'org-A', asPropertyId('11111111-1111-4111-8111-111111111111')),
    ).rejects.toThrow(/property read failed/)
  })
})
