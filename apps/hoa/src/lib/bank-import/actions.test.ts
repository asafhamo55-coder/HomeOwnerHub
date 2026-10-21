import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

// BL-144 server actions. Role first, then the account (manual, this
// association), then the file. Preview writes nothing; commit re-reads the
// same file, skips stored rows and writes one audit row (ids and counts).

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: boolean; role?: string; orgId?: string; error?: string },
  client: null as unknown,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({ requireBoardOrAdminForAction: async () => h.gate }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1', name: 'Oak', timeZone: 'America/New_York' }) }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => h.client }))

import { commitBankImport, createManualBankAccount, previewBankImport } from './actions'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureBytes = (name: string) => readFileSync(path.join(here, 'fixtures', name))
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

const MANUAL = '11111111-1111-4111-8111-111111111111'
const LINKED = '22222222-2222-4222-8222-222222222222'
const OTHER_ASSOC = '33333333-3333-4333-8333-333333333333'
const FUND = '44444444-4444-4444-8444-444444444444'

function seed(extra: Record<string, Array<Record<string, unknown>>> = {}) {
  const m = memorySupabase({
    bank_accounts: [
      { id: MANUAL, association_id: 'assoc-1', organization_id: 'org-1', plaid_item_id: null, is_active: true },
      { id: LINKED, association_id: 'assoc-1', organization_id: 'org-1', plaid_item_id: 'item-1', is_active: true },
      { id: OTHER_ASSOC, association_id: 'assoc-2', organization_id: 'org-2', plaid_item_id: null, is_active: true },
    ],
    funds: [{ id: FUND, association_id: 'assoc-1' }],
    ...extra,
  })
  h.client = m.client
  return m
}

function upload(accountId: string, bytes: Uint8Array, hash?: string) {
  const f = new FormData()
  f.append('bankAccountId', accountId)
  f.append('file', new File([new Uint8Array(bytes)], 'statement.csv', { type: 'text/csv' }))
  if (hash) f.append('fileHash', hash)
  return f
}

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  h.client = null
})

describe('the role gate comes first', () => {
  it('a resident is refused by all three actions before any read', async () => {
    h.gate = { ok: false, error: 'denied' }
    const m = seed()
    const bytes = fixtureBytes('chase-style.csv')
    expect(await createManualBankAccount({ accountName: 'Ops', fundId: FUND })).toEqual({ ok: false, error: 'denied' })
    expect(await previewBankImport(upload(MANUAL, bytes))).toEqual({ ok: false, error: 'denied' })
    expect(await commitBankImport(upload(MANUAL, bytes, sha(bytes)))).toEqual({ ok: false, error: 'denied' })
    expect(m.calls).toEqual([])
  })
})

describe('createManualBankAccount', () => {
  it('adds an account with no Plaid ids, in the caller’s org and association, audited without names', async () => {
    const m = seed()
    const r = await createManualBankAccount({ accountName: '  Operating   checking ', bankName: 'First CU', last4: '1234', fundId: FUND })
    expect(r.ok).toBe(true)
    const added = m.rows('bank_accounts').find((a) => a.account_name === 'Operating checking')
    expect(added).toMatchObject({
      organization_id: 'org-1',
      association_id: 'assoc-1',
      fund_id: FUND,
      plaid_item_id: null,
      plaid_account_id: null,
      bank_name: 'First CU',
      last4: '1234',
      is_active: true,
    })
    const audit = m.rows('audit_log')
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: 'bank_account.manual_created', entity_type: 'bank_account', entity_id: added!.id, org_id: 'org-1' })
    expect(JSON.stringify(audit[0]!.metadata)).not.toMatch(/Operating|First CU|1234/)
  })

  it('validates before touching the database', async () => {
    const m = seed()
    const r = await createManualBankAccount({ accountName: '', last4: '12345', fundId: 'nope' })
    expect(r).toMatchObject({ ok: false, fieldErrors: { accountName: expect.any(String), last4: expect.any(String), fundId: expect.any(String) } })
    expect(m.calls).toEqual([])
  })

  it('refuses a fund from another association', async () => {
    const m = seed({ funds: [{ id: FUND, association_id: 'assoc-2' }] })
    const r = await createManualBankAccount({ accountName: 'Ops', fundId: FUND })
    expect(r).toMatchObject({ ok: false, fieldErrors: { fundId: 'That fund isn’t part of your association.' } })
    expect(m.calls.filter((c) => c.op === 'insert')).toEqual([])
  })
})

describe('previewBankImport (dry run)', () => {
  it('counts new, already-imported and unreadable rows, and writes nothing', async () => {
    const m = seed({
      bank_transactions: [
        { id: 't1', bank_account_id: MANUAL, posted_date: '2026-10-01', amount: 250, memo: 'dues deposit mp-1001-dues', merchant: null },
      ],
    })
    const bytes = fixtureBytes('chase-style.csv')
    const r = await previewBankImport(upload(MANUAL, bytes))
    if (!r.ok) throw new Error(r.error)
    expect(r.counts).toEqual({ readable: 5, new: 4, duplicates: 1, problems: 0 })
    expect(r.fileHash).toBe(sha(bytes))
    expect(r.span).toEqual({ from: '2026-10-01', to: '2026-10-09' })
    expect(r.newTotalCents).toEqual({ in: 150_000, out: -(120_000 + 8550 + 31_247) })
    expect(r.sample.map((s) => s.line)).toEqual([3, 4, 5, 6])
    expect(m.calls.every((c) => c.op === 'select')).toBe(true)
  })

  it('refuses a Plaid-linked account, another association’s account and a bad id', async () => {
    seed()
    const bytes = fixtureBytes('chase-style.csv')
    expect(await previewBankImport(upload(LINKED, bytes))).toMatchObject({ ok: false, error: expect.stringMatching(/linked through Plaid/) })
    expect(await previewBankImport(upload(OTHER_ASSOC, bytes))).toEqual({ ok: false, error: 'Bank account not found in this association.' })
    expect(await previewBankImport(upload('x', bytes))).toEqual({ ok: false, error: 'That bank account isn’t valid.' })
  })

  it('refuses a missing file, an oversized file and a binary file', async () => {
    seed()
    const none = new FormData()
    none.append('bankAccountId', MANUAL)
    expect(await previewBankImport(none)).toEqual({ ok: false, error: 'Choose a statement file to import.' })
    expect(await previewBankImport(upload(MANUAL, new Uint8Array(2 * 1024 * 1024 + 1)))).toMatchObject({ ok: false, error: expect.stringMatching(/larger than 2 MB/) })
    expect(await previewBankImport(upload(MANUAL, new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x01])))).toMatchObject({ ok: false, error: expect.stringMatching(/isn’t a CSV or OFX/) })
  })
})

describe('commitBankImport', () => {
  it('needs the previewed file: a different hash writes nothing', async () => {
    const m = seed()
    const bytes = fixtureBytes('chase-style.csv')
    expect(await commitBankImport(upload(MANUAL, bytes))).toMatchObject({ ok: false, error: expect.stringMatching(/changed since the preview/) })
    expect(await commitBankImport(upload(MANUAL, bytes, 'a'.repeat(64)))).toMatchObject({ ok: false })
    expect(m.calls.filter((c) => c.op !== 'select')).toEqual([])
  })

  it('inserts unmatched rows into the queue, stamps the account, audits counts only; a second run inserts nothing', async () => {
    const m = seed()
    const bytes = fixtureBytes('statement-sgml.ofx')
    const first = await commitBankImport(upload(MANUAL, bytes, sha(bytes)))
    expect(first).toEqual({ ok: true, inserted: 3, duplicates: 0, problems: 1 })

    const txns = m.rows('bank_transactions')
    expect(txns.map((t) => [t.posted_date, t.amount, t.memo])).toEqual([
      ['2026-10-02', 250, 'DUES DEPOSIT MP-1005-DUES'],
      ['2026-10-10', -64.1, 'SMITH & SONS HARDWARE'],
      ['2026-10-12', -300, 'Check 1044'],
    ])
    for (const t of txns) {
      expect(t).toMatchObject({ organization_id: 'org-1', bank_account_id: MANUAL, plaid_transaction_id: null, merchant: null })
      // Unmatched: exactly what the matching queue lists.
      expect(t.matched_journal_entry_id ?? null).toBeNull()
    }
    expect(m.rows('bank_accounts').find((a) => a.id === MANUAL)!.last_synced_at).toEqual(expect.any(String))

    const audit = m.rows('audit_log')
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: 'bank_import.committed', entity_type: 'bank_account', entity_id: MANUAL })
    expect(audit[0]!.metadata).toEqual({
      association_id: 'assoc-1',
      format: 'ofx',
      file_bytes: bytes.byteLength,
      rows_readable: 3,
      inserted: 3,
      duplicates: 0,
      problems: 1,
      actor_role: 'board',
      error_code: null,
    })

    const again = await commitBankImport(upload(MANUAL, bytes, sha(bytes)))
    expect(again).toEqual({ ok: true, inserted: 0, duplicates: 3, problems: 1 })
    expect(m.rows('bank_transactions')).toHaveLength(3)
  })

  it('a failed insert reports nothing saved and writes no audit row', async () => {
    const m = memorySupabase(
      { bank_accounts: [{ id: MANUAL, association_id: 'assoc-1', plaid_item_id: null, is_active: true }] },
      { failOn: (c) => (c.table === 'bank_transactions' && c.op === 'insert' ? { code: '42501', message: 'rls' } : null) },
    )
    h.client = m.client
    const bytes = fixtureBytes('headerless.csv')
    expect(await commitBankImport(upload(MANUAL, bytes, sha(bytes)))).toEqual({
      ok: false,
      inserted: 0,
      error: 'Only board members and admins can change accounting records.',
    })
    expect(m.rows('audit_log')).toEqual([])
  })

  it('a failed read of stored rows refuses instead of importing duplicates', async () => {
    const m = memorySupabase(
      { bank_accounts: [{ id: MANUAL, association_id: 'assoc-1', plaid_item_id: null, is_active: true }] },
      { failOn: (c) => (c.table === 'bank_transactions' && c.op === 'select' ? { code: '500', message: 'x' } : null) },
    )
    h.client = m.client
    const bytes = fixtureBytes('headerless.csv')
    expect(await commitBankImport(upload(MANUAL, bytes, sha(bytes)))).toMatchObject({ ok: false, error: expect.stringMatching(/nothing was changed/) })
    expect(m.rows('bank_transactions')).toEqual([])
  })
})
