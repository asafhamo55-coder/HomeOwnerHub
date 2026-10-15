/**
 * Sub-project D: the approval layer, with W18 as the first consumer.
 *
 * Before 0060, W18 Step A (exact memo + amount) posted a cash-receipt
 * journal entry and marked the assessment paid on its own. These tests
 * prove, against real Postgres + PostgREST + GoTrue:
 *   - W18 now only PROPOSES (no JE, no payment, assessment untouched);
 *   - approval posts exactly once, even when approve is called twice,
 *     sequentially or concurrently;
 *   - a resident cannot approve, read, or edit a proposal;
 *   - a board member of another org cannot approve or reject it.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds and observes; every
 * authorization assertion goes through a real user JWT client.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { bankReconciliationAgent } from '../../../packages/workflows/src/W18-bank-reconciliation'
import { approveRequest, rejectRequest } from '../../../packages/workflows/src/approvals'
import {
  adminDb,
  makeAccounting,
  makeOrg,
  makeUnit,
  mintUser,
  type AccountingRefs,
  type OrgFixture,
} from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const AMOUNT = 250

interface Scenario {
  org: OrgFixture
  acct: AccountingRefs
  txnId: string
  assessmentId: string
}

async function seedScenario(): Promise<Scenario> {
  const db = adminDb()
  const org = await makeOrg()
  const acct = await makeAccounting(org)
  const unitId = await makeUnit(org)
  const memoCode = `TST-${String(Math.floor(100 + Math.random() * 899))}-DUES`

  const { data: assessment, error: aErr } = await db
    .from('assessments')
    .insert({
      organization_id: org.orgId,
      association_id: org.associationId,
      unit_id: unitId,
      fiscal_period_id: acct.fiscalPeriodId,
      assessment_type: 'regular',
      amount: AMOUNT,
      due_date: '2026-10-01',
      status: 'open',
      memo_code: memoCode,
    })
    .select('id')
    .single()
  if (aErr || !assessment) throw new Error(`seed assessment: ${aErr?.message}`)

  const { data: bank, error: bErr } = await db
    .from('bank_accounts')
    .insert({
      organization_id: org.orgId,
      association_id: org.associationId,
      fund_id: acct.fundIds.OPERATING,
      account_name: 'Test Checking',
    })
    .select('id')
    .single()
  if (bErr || !bank) throw new Error(`seed bank account: ${bErr?.message}`)

  const { data: txn, error: tErr } = await db
    .from('bank_transactions')
    .insert({
      organization_id: org.orgId,
      bank_account_id: bank.id,
      plaid_transaction_id: `txn-${randomUUID()}`,
      amount: AMOUNT,
      posted_date: '2026-10-02',
      memo: `ZELLE FROM RESIDENT MEMO: ${memoCode}`,
    })
    .select('id')
    .single()
  if (tErr || !txn) throw new Error(`seed txn: ${tErr?.message}`)

  return { org, acct, txnId: txn.id, assessmentId: assessment.id }
}

async function runW18(s: Scenario) {
  return bankReconciliationAgent.execute(
    { bankTransactionId: s.txnId },
    { organizationId: s.org.orgId },
  )
}

async function proposalsFor(txnId: string) {
  const { data, error } = await adminDb()
    .from('approval_requests')
    .select('*')
    .eq('subject_id', txnId)
  if (error) throw new Error(error.message)
  return data ?? []
}

async function journalEntryCount(associationId: string): Promise<number> {
  const { count, error } = await adminDb()
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('association_id', associationId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function ledgerState(s: Scenario) {
  const db = adminDb()
  const [txn, assessment, payments, jeCount] = await Promise.all([
    db.from('bank_transactions').select('matched_journal_entry_id').eq('id', s.txnId).single(),
    db.from('assessments').select('status').eq('id', s.assessmentId).single(),
    db.from('payments').select('id').eq('assessment_id', s.assessmentId),
    journalEntryCount(s.org.associationId),
  ])
  return {
    matchedJe: txn.data?.matched_journal_entry_id ?? null,
    assessmentStatus: assessment.data?.status,
    payments: (payments.data ?? []).length,
    journalEntries: jeCount,
  }
}

async function proposeFor(s: Scenario): Promise<string> {
  const result = await runW18(s)
  const id = result.output.approvalRequestId
  if (!id) throw new Error('W18 did not return an approvalRequestId')
  return id
}

describe('approval layer: W18 cash receipts', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('W18 Step A proposes instead of posting: no JE, no payment, assessment still open', async () => {
    const s = await seedScenario()

    const result = await runW18(s)

    expect(result.output.matchMethod).toBe('proposed_exact')
    expect(result.output.matchedJournalEntryId).toBeNull()
    expect(result.status, 'the ai_runs row must say a human is needed').toBe('pending_human_approval')

    expect(await ledgerState(s)).toEqual({
      matchedJe: null,
      assessmentStatus: 'open',
      payments: 0,
      journalEntries: 0,
    })

    const proposals = await proposalsFor(s.txnId)
    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({
      id: result.output.approvalRequestId,
      status: 'proposed',
      workflow_id: 'W18',
      action_type: 'w18.cash_receipt',
      organization_id: s.org.orgId,
    })
    expect(Number(proposals[0].amount)).toBe(AMOUNT)
  })

  it('re-running W18 on the same transaction does not create a second proposal', async () => {
    const s = await seedScenario()
    const first = await runW18(s)
    const second = await runW18(s)

    expect(second.output.approvalRequestId).toBe(first.output.approvalRequestId)
    expect(await proposalsFor(s.txnId)).toHaveLength(1)
    expect(await journalEntryCount(s.org.associationId)).toBe(0)
  })

  it('a board member approving posts exactly once, even when approve is called twice', async () => {
    const s = await seedScenario()
    const board = await mintUser(s.org, 'board')
    const id = await proposeFor(s)

    const first = await approveRequest(board.client, adminDb(), id)
    expect(first).toMatchObject({ ok: true, status: 'posted', alreadyDecided: false })

    const after1 = await ledgerState(s)
    expect(after1.journalEntries).toBe(1)
    expect(after1.payments).toBe(1)
    expect(after1.assessmentStatus).toBe('paid')
    expect(after1.matchedJe).not.toBeNull()

    const second = await approveRequest(board.client, adminDb(), id)
    expect(second).toMatchObject({ ok: true, status: 'posted', alreadyDecided: true })

    expect(await ledgerState(s), 'a second approve must not post again').toEqual(after1)

    const [row] = await proposalsFor(s.txnId)
    expect(row).toMatchObject({
      status: 'posted',
      decided_by: board.id,
      result_ref: after1.matchedJe,
      error: null,
    })
    expect(row.decided_at).not.toBeNull()
    expect(row.posted_at).not.toBeNull()

    // Audit: the JE records the approver and the workflow.
    const { data: je } = await adminDb()
      .from('journal_entries')
      .select('created_by, posted_by, ai_generated, ai_workflow_id, source, source_id, status')
      .eq('id', after1.matchedJe!)
      .single()
    expect(je).toMatchObject({
      created_by: board.id,
      posted_by: board.id,
      ai_generated: true,
      ai_workflow_id: 'W18',
      source: 'bank_rec',
      source_id: s.txnId,
      status: 'posted',
    })
  })

  it('two concurrent approvals post exactly once', async () => {
    const s = await seedScenario()
    const boardA = await mintUser(s.org, 'board')
    const adminA = await mintUser(s.org, 'admin')
    const id = await proposeFor(s)

    const results = await Promise.all([
      approveRequest(boardA.client, adminDb(), id),
      approveRequest(adminA.client, adminDb(), id),
    ])

    expect(results.every((r) => r.ok)).toBe(true)
    expect(results.filter((r) => r.ok && !r.alreadyDecided)).toHaveLength(1)
    expect(await journalEntryCount(s.org.associationId)).toBe(1)
    const { data: payments } = await adminDb()
      .from('payments')
      .select('id')
      .eq('assessment_id', s.assessmentId)
    expect(payments ?? []).toHaveLength(1)
  })

  it('a resident cannot approve, and cannot read or edit the proposal directly', async () => {
    const s = await seedScenario()
    const resident = await mintUser(s.org, 'resident')
    const board = await mintUser(s.org, 'board')
    const id = await proposeFor(s)

    const r = await approveRequest(resident.client, adminDb(), id)
    expect(r.ok).toBe(false)
    expect(await ledgerState(s)).toMatchObject({ journalEntries: 0, assessmentStatus: 'open' })
    expect((await proposalsFor(s.txnId))[0].status).toBe('proposed')

    // Positive control first: a board member CAN see it, so the resident's
    // empty result below is the policy, not a broken query.
    const seenByBoard = await board.client.from('approval_requests').select('id').eq('id', id)
    expect(seenByBoard.data).toHaveLength(1)

    const seenByResident = await resident.client.from('approval_requests').select('id').eq('id', id)
    expect(seenByResident.error).toBeNull()
    expect(seenByResident.data ?? []).toHaveLength(0)

    await resident.client
      .from('approval_requests')
      .update({ status: 'approved' })
      .eq('id', id)
    expect((await proposalsFor(s.txnId))[0].status).toBe('proposed')
  })

  it('a board member of another org cannot approve or reject', async () => {
    const s = await seedScenario()
    const otherOrg = await makeOrg()
    const foreignBoard = await mintUser(otherOrg, 'board')
    const foreignAdmin = await mintUser(otherOrg, 'admin')
    const id = await proposeFor(s)

    const approve = await approveRequest(foreignBoard.client, adminDb(), id)
    expect(approve).toEqual({ ok: false, error: 'You are not allowed to decide this request.' })

    const reject = await rejectRequest(foreignAdmin.client, id, 'not yours')
    expect(reject.ok).toBe(false)

    const [row] = await proposalsFor(s.txnId)
    expect(row.status).toBe('proposed')
    expect(row.decided_by).toBeNull()
    expect(await journalEntryCount(s.org.associationId)).toBe(0)
  })

  it('a board member cannot edit the payload of a proposal and then approve it', async () => {
    // No UPDATE policy for authenticated: the only user write is the
    // decision RPC, so the amount being approved is the amount W18 proposed.
    const s = await seedScenario()
    const board = await mintUser(s.org, 'board')
    const id = await proposeFor(s)

    await board.client
      .from('approval_requests')
      .update({ amount: 1, status: 'posted' })
      .eq('id', id)

    const [row] = await proposalsFor(s.txnId)
    expect(Number(row.amount)).toBe(AMOUNT)
    expect(row.status).toBe('proposed')
  })

  it('rejection records who and why, posts nothing, and blocks a later approve', async () => {
    const s = await seedScenario()
    const board = await mintUser(s.org, 'board')
    const id = await proposeFor(s)

    const missingReason = await rejectRequest(board.client, id, '  ')
    expect(missingReason.ok).toBe(false)

    const r = await rejectRequest(board.client, id, 'memo code belongs to a different unit')
    expect(r).toMatchObject({ ok: true, status: 'rejected' })

    const [row] = await proposalsFor(s.txnId)
    expect(row).toMatchObject({
      status: 'rejected',
      decided_by: board.id,
      decision_reason: 'memo code belongs to a different unit',
    })

    const later = await approveRequest(board.client, adminDb(), id)
    expect(later.ok).toBe(false)
    expect(await ledgerState(s)).toMatchObject({ journalEntries: 0, payments: 0, assessmentStatus: 'open' })
  })

  it('approval of a proposal whose transaction was already matched by hand marks it failed and posts nothing', async () => {
    const s = await seedScenario()
    const board = await mintUser(s.org, 'board')
    const id = await proposeFor(s)

    // A manager posted and linked a JE by hand in the meantime.
    const { postJournalEntry } = await import('../../../packages/db/src')
    const manual = await postJournalEntry(adminDb(), {
      organizationId: s.org.orgId,
      associationId: s.org.associationId,
      fiscalPeriodId: s.acct.fiscalPeriodId,
      entryDate: '2026-10-02',
      memo: 'manual',
      source: 'manual',
      lines: [
        { accountId: s.acct.accountIds['1010'], fundId: s.acct.fundIds.OPERATING, debit: AMOUNT, credit: 0 },
        { accountId: s.acct.accountIds['1100'], fundId: s.acct.fundIds.OPERATING, debit: 0, credit: AMOUNT },
      ],
    })
    if (!manual.ok) throw new Error(manual.error)
    await adminDb()
      .from('bank_transactions')
      .update({ matched_journal_entry_id: manual.journalEntryId, match_method: 'manual' })
      .eq('id', s.txnId)

    const r = await approveRequest(board.client, adminDb(), id)
    expect(r).toMatchObject({ ok: false, status: 'failed' })
    expect(await journalEntryCount(s.org.associationId)).toBe(1)

    const [row] = await proposalsFor(s.txnId)
    expect(row.status).toBe('failed')
    expect(row.error).toMatch(/already matched/)
  })
})
