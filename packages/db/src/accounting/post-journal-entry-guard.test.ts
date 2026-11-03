import { describe, expect, it } from 'vitest'
import { postJournalEntry } from './post-journal-entry'
import { CLOSED_PERIOD_MESSAGE } from './period-guard'

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function db(closedRows: unknown[] | null, lookupError = false) {
  const touched: string[] = []
  const periodChain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'lte', 'gte', 'or']) periodChain[m] = () => periodChain
  periodChain.limit = async () => ({ data: closedRows, error: lookupError ? { message: 'x' } : null })
  return {
    touched,
    client: {
      from: (t: string) => {
        touched.push(t)
        return t === 'fiscal_periods' ? periodChain : { insert: () => { throw new Error('must not write') } }
      },
      rpc: () => { throw new Error('must not write') },
    } as never,
  }
}

const input = {
  organizationId: U(1),
  associationId: U(2),
  fiscalPeriodId: U(3),
  entryDate: '2025-02-01',
  memo: 'm',
  source: 'manual' as const,
  lines: [
    { accountId: U(4), fundId: U(5), debit: 10, credit: 0 },
    { accountId: U(6), fundId: U(5), debit: 0, credit: 10 },
  ],
}

describe('postJournalEntry closed-period guard', () => {
  it('refuses an entry dated in a closed period before writing anything', async () => {
    const d = db([{ id: 'p' }])
    const r = await postJournalEntry(d.client, input)
    expect(r).toEqual({ ok: false, error: CLOSED_PERIOD_MESSAGE })
    expect(d.touched).toEqual(['fiscal_periods'])
  })

  it('fails closed when the period lookup errors', async () => {
    const d = db(null, true)
    const r = await postJournalEntry(d.client, input)
    expect(r.ok).toBe(false)
    expect(d.touched).toEqual(['fiscal_periods'])
  })
})
