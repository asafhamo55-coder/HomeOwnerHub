/**
 * BL-175b (0070): the mailbox / W18 half of the cross-org planting attack.
 * CI only (no local database).
 *
 * The send job follows inbox_drafts.mailbox_account_id with the service role,
 * so a draft planted in org A that names org B's mailbox would send from B's
 * mailbox. W18 (bank reconciliation) and the recurring-JE job follow
 * bank_transactions.bank_account_id and recurring_journal_entries.template_je_id
 * the same way. Each must be refused with 23503 from the board's own JWT and
 * from the service role; the same-org row must still insert.
 *
 * Ids and counts only; no PII.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeAccounting, makeOrg, mintUser, type AccountingRefs, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let orgA: OrgFixture
let orgB: OrgFixture
let boardA: TestUser // board of A; also a member of B in the second block
let acctA: AccountingRefs
let acctB: AccountingRefs

async function seed(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminDb().from(table as never).insert(row as never).select('id').single()
  if (error || !data) throw new Error(`seed ${table}: ${error?.code ?? 'no row'} ${error?.message ?? ''}`)
  return (data as { id: string }).id
}

const mailbox = (o: OrgFixture) =>
  seed('mailbox_accounts', { organization_id: o.orgId, email_address: `box-${randomUUID().slice(0, 8)}@example.test` })
const thread = (o: OrgFixture, mailboxId: string) =>
  seed('inbox_threads', { organization_id: o.orgId, mailbox_account_id: mailboxId, gmail_thread_id: `t-${randomUUID()}` })
const bankAccount = (o: OrgFixture, a: AccountingRefs) =>
  seed('bank_accounts', {
    organization_id: o.orgId,
    association_id: o.associationId,
    fund_id: a.fundIds.OPERATING,
    account_name: 'Checking',
  })
const journal = (o: OrgFixture, a: AccountingRefs) =>
  seed('journal_entries', {
    organization_id: o.orgId,
    association_id: o.associationId,
    fiscal_period_id: a.fiscalPeriodId,
    entry_number: `JE-${randomUUID().slice(0, 8)}`,
    entry_date: '2026-01-01',
    memo: 'template',
    source: 'manual',
  })

beforeEach(async () => {
  await truncateAll()
  orgA = await makeOrg()
  orgB = await makeOrg()
  boardA = await mintUser(orgA, 'board')
  acctA = await makeAccounting(orgA)
  acctB = await makeAccounting(orgB)
})

describe('0070: mailbox rows are same-org', () => {
  it('a draft that names another org’s mailbox or thread is refused (23503), user and service role', async () => {
    const boxA = await mailbox(orgA)
    const boxB = await mailbox(orgB)
    const threadA = await thread(orgA, boxA)
    const threadB = await thread(orgB, boxB)
    const draft = (extra: Record<string, unknown>) => ({
      organization_id: orgA.orgId,
      thread_id: threadA,
      subject: 'planted',
      body_text: 'planted',
      ...extra,
    })

    for (const client of [boardA.client, adminDb()]) {
      const viaMailbox = await client.from('inbox_drafts' as never).insert(draft({ mailbox_account_id: boxB }) as never)
      expect(viaMailbox.error?.code, 'draft -> foreign mailbox').toBe('23503')
      const viaThread = await client.from('inbox_drafts' as never).insert(draft({ thread_id: threadB }) as never)
      expect(viaThread.error?.code, 'draft -> foreign thread').toBe('23503')
    }

    // The control: the same draft against A's own mailbox and thread.
    const ok = await boardA.client.from('inbox_drafts' as never).insert(draft({ mailbox_account_id: boxA }) as never)
    expect(ok.error, 'same-org draft was refused: the trigger is too strict').toBeNull()
  })

  it('a draft UPDATE that re-points it to another org’s mailbox is refused', async () => {
    const boxA = await mailbox(orgA)
    const boxB = await mailbox(orgB)
    const threadA = await thread(orgA, boxA)
    const draftId = await seed('inbox_drafts', { organization_id: orgA.orgId, thread_id: threadA, mailbox_account_id: boxA, subject: 's', body_text: 'b' })
    const upd = await boardA.client.from('inbox_drafts' as never).update({ mailbox_account_id: boxB } as never).eq('id', draftId).select('id')
    expect(upd.error?.code).toBe('23503')
    const { data } = await adminDb().from('inbox_drafts' as never).select('mailbox_account_id').eq('id', draftId).single()
    expect((data as unknown as { mailbox_account_id: string }).mailbox_account_id).toBe(boxA)
  })

  it('a thread that names another org’s mailbox is refused (23503)', async () => {
    const boxA = await mailbox(orgA)
    const boxB = await mailbox(orgB)
    for (const client of [boardA.client, adminDb()]) {
      const bad = await client
        .from('inbox_threads' as never)
        .insert({ organization_id: orgA.orgId, mailbox_account_id: boxB, gmail_thread_id: `t-${randomUUID()}` } as never)
      expect(bad.error?.code).toBe('23503')
    }
    const ok = await boardA.client
      .from('inbox_threads' as never)
      .insert({ organization_id: orgA.orgId, mailbox_account_id: boxA, gmail_thread_id: `t-${randomUUID()}` } as never)
    expect(ok.error).toBeNull()
  })
})

describe('0070: W18 / accounting rows are same-org', () => {
  it('a bank transaction on another org’s bank account is refused (23503)', async () => {
    const bankA = await bankAccount(orgA, acctA)
    const bankB = await bankAccount(orgB, acctB)
    const txn = (bank: string) => ({
      organization_id: orgA.orgId,
      bank_account_id: bank,
      amount: 10,
      posted_date: '2026-01-02',
      plaid_transaction_id: `tx-${randomUUID()}`,
    })
    for (const client of [boardA.client, adminDb()]) {
      const bad = await client.from('bank_transactions').insert(txn(bankB) as never)
      expect(bad.error?.code).toBe('23503')
    }
    const ok = await boardA.client.from('bank_transactions').insert(txn(bankA) as never)
    expect(ok.error, 'same-org bank transaction was refused').toBeNull()
  })

  it('a recurring rule whose template JE is another org’s is refused (23503)', async () => {
    const jeA = await journal(orgA, acctA)
    const jeB = await journal(orgB, acctB)
    const rule = (je: string) => ({
      organization_id: orgA.orgId,
      association_id: orgA.associationId,
      template_je_id: je,
      cadence: 'monthly',
      next_run_date: '2026-11-01',
    })
    for (const client of [boardA.client, adminDb()]) {
      const bad = await client.from('recurring_journal_entries').insert(rule(jeB) as never)
      expect(bad.error?.code).toBe('23503')
    }
    const ok = await boardA.client.from('recurring_journal_entries').insert(rule(jeA) as never)
    expect(ok.error, 'same-org recurring rule was refused').toBeNull()
  })
})
