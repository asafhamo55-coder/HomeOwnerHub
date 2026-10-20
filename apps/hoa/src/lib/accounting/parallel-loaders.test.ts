import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import { heldDb, settle } from '@/lib/supabase/held-fake-db'

/**
 * BL-099 static pass: accounting reads that do not depend on each other
 * are sent together, and the accounting context no longer re-reads the
 * association row the primary-association read already returned.
 */
let db: SupabaseClient
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: async () => ({ id: 'org-1', name: 'Org' }) }))
vi.mock('@/lib/primary-association', () => ({
  getPrimaryAssociationResult: async () => ({
    ok: true,
    data: { id: 'assoc-1', name: 'Maple HOA', timeZone: 'America/Los_Angeles' },
    count: null,
  }),
}))

const { readLedgerLines, getJournalEntry, getAccountingContext } = await import('./queries')

const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`

describe('readLedgerLines', () => {
  const jeIds = Array.from({ length: 450 }, (_, i) => id('je', i))
  const lines = jeIds.map((je, i) => ({ id: id('l', i), journal_entry_id: je, debit_amount: 1 }))

  it('pages every chunk at once and returns every line', async () => {
    const fake = cappedFakeDb({ ledger_entries: lines })
    const h = heldDb(fake.db, ['ledger_entries'])
    const result = readLedgerLines<{ id: string }>(h.db as never, 'id', jeIds)
    await settle()
    // 450 ids in chunks of 150: three chunk reads in flight together.
    expect(h.started.filter((t) => t === 'ledger_entries')).toHaveLength(3)
    h.release()
    const rows = await result
    expect(rows.map((r) => r.id)).toEqual(lines.map((l) => l.id))
  })

  it('a failed chunk still fails the whole read', async () => {
    const fake = cappedFakeDb({ ledger_entries: lines }, { failAt: { table: 'ledger_entries', from: 0 } })
    await expect(readLedgerLines(fake.db as never, 'id', jeIds)).rejects.toThrow(/57014/)
  })
})

describe('getJournalEntry', () => {
  const tables = {
    journal_entries: [{ id: 'je-1', association_id: 'assoc-1', entry_number: 'JE-1' }],
    ledger_entries: [
      {
        id: 'l1',
        journal_entry_id: 'je-1',
        debit_amount: 10,
        credit_amount: 0,
        memo: null,
        account: { id: 'a1', account_number: '1000', account_name: 'Cash', account_type: 'asset' },
        fund: { id: 'f1', code: 'OPERATING', name: 'Operating Fund' },
      },
    ],
  }

  it('reads the lines while the header read is in flight', async () => {
    const fake = cappedFakeDb(tables)
    const h = heldDb(fake.db, ['journal_entries'])
    db = h.db
    const result = getJournalEntry('assoc-1', 'je-1')
    await settle()
    expect(h.started).toEqual(expect.arrayContaining(['journal_entries', 'ledger_entries']))
    h.release()
    const entry = await result
    expect(entry?.lines).toHaveLength(1)
  })

  it('an entry outside the association is still null', async () => {
    ;({ db } = cappedFakeDb(tables))
    expect(await getJournalEntry('assoc-2', 'je-1')).toBeNull()
  })
})

describe('getAccountingContext', () => {
  it('does not re-read the associations row', async () => {
    const fake = cappedFakeDb({
      fiscal_periods: [{ id: 'fp-1', association_id: 'assoc-1', start_date: '2026-01-01' }],
    })
    db = fake.db
    const ctx = await getAccountingContext()
    expect(fake.calls.map((c) => c.table)).toEqual(['fiscal_periods'])
    expect(ctx).toMatchObject({
      organizationId: 'org-1',
      associationId: 'assoc-1',
      associationName: 'Maple HOA',
      timeZone: 'America/Los_Angeles',
      currentPeriod: { id: 'fp-1' },
    })
  })
})
