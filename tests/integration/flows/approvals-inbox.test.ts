/**
 * BL-014: the /approvals inbox, end to end against real Postgres +
 * PostgREST + GoTrue.
 *
 * Drives the same composition the /approvals server action uses
 * (apps/hoa/src/lib/approvals-inbox/actions.ts): the board member's own
 * RLS client lists the section (loadW18Section), and the decision goes
 * through decideApprovalFor + postingHandlers(userDb, adminDb) — i.e. the
 * existing approval-layer executor, not a new posting path. The only part
 * not exercised is the Next wrapper (cookie client construction and
 * revalidatePath).
 *
 * Proves: a W18 proposal appears in the inbox; approving it from the inbox
 * posts exactly once; a second approve is a no-op that posts nothing; the
 * item leaves the inbox and the badge count drops; a resident gets nothing.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { bankReconciliationAgent } from '../../../packages/workflows/src/W18-bank-reconciliation'
import { countPendingApprovals, loadW18Section } from '../../../apps/hoa/src/lib/approvals-inbox/load'
import { decideApprovalFor, postingHandlers } from '../../../apps/hoa/src/lib/approvals-inbox/decide'
import { adminDb, makeAccounting, makeOrg, makeUnit, mintUser, type OrgFixture } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

// The W18 flows below never reach the vendor or W3 handlers (BL-048).
const notUsed = async () => ({ ok: false as const, error: 'not used' })
const OTHER_HANDLERS = {
  approveVendor: notUsed,
  rejectVendor: notUsed,
  approveViolationDraft: notUsed,
  rejectViolationDraft: notUsed,
}

const AMOUNT = 180

interface Scenario {
  org: OrgFixture
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

  return { org, txnId: txn.id, assessmentId: assessment.id }
}

async function ledgerState(s: Scenario) {
  const db = adminDb()
  const [txn, assessment, payments, jes] = await Promise.all([
    db.from('bank_transactions').select('matched_journal_entry_id').eq('id', s.txnId).single(),
    db.from('assessments').select('status').eq('id', s.assessmentId).single(),
    db.from('payments').select('id').eq('assessment_id', s.assessmentId),
    db.from('journal_entries').select('id', { count: 'exact', head: true }).eq('association_id', s.org.associationId),
  ])
  return {
    matchedJe: txn.data?.matched_journal_entry_id ?? null,
    assessmentStatus: assessment.data?.status,
    payments: (payments.data ?? []).length,
    journalEntries: jes.count ?? 0,
  }
}

describe('approvals inbox: W18 via /approvals', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('lists the W18 proposal, approving it posts exactly once, and a second approve posts nothing', async () => {
    const s = await seedScenario()
    const board = await mintUser(s.org, 'board')
    await bankReconciliationAgent.execute({ bankTransactionId: s.txnId }, { organizationId: s.org.orgId })

    // The inbox lists it, read through the board member's own RLS client.
    const section = await loadW18Section(board.client, s.org.orgId)
    expect(section.ok).toBe(true)
    if (!section.ok) throw new Error('unreachable')
    expect(section.total).toBe(1)
    const [item] = section.items
    expect(item.amount).toBe(AMOUNT)
    expect(item.reasoning, 'the matcher’s notes come from the W18 ai_runs row').toMatch(/exact match/)
    expect(item.decision?.kind).toBe('w18')
    expect(await countPendingApprovals(board.client, s.org.orgId)).toMatchObject({ w18: 1, w3: 0 })
    expect(await ledgerState(s)).toMatchObject({ journalEntries: 0, payments: 0, assessmentStatus: 'open' })

    const handlers = {
      ...postingHandlers(board.client, adminDb()),
      ...OTHER_HANDLERS,
    }
    const input = { kind: 'w18' as const, id: item.id, decision: 'approve' as const }

    const first = await decideApprovalFor('board', input, handlers)
    expect(first).toEqual({ ok: true, message: 'Approved and posted to the ledger.' })
    const after1 = await ledgerState(s)
    expect(after1).toMatchObject({ journalEntries: 1, payments: 1, assessmentStatus: 'paid' })
    expect(after1.matchedJe).not.toBeNull()

    const second = await decideApprovalFor('board', input, handlers)
    expect(second).toEqual({ ok: true, message: 'Already approved — nothing was posted again.' })
    expect(await ledgerState(s), 'a second approve from the inbox must not post again').toEqual(after1)

    // It has left the inbox, and the badge count with it.
    const afterSection = await loadW18Section(board.client, s.org.orgId)
    expect(afterSection).toMatchObject({ ok: true, total: 0, items: [] })
    expect((await countPendingApprovals(board.client, s.org.orgId)).w18).toBe(0)

    const { data: row } = await adminDb().from('approval_requests').select('status, decided_by, result_ref').eq('id', item.id).single()
    expect(row).toMatchObject({ status: 'posted', decided_by: board.id, result_ref: after1.matchedJe })
  })

  it('two concurrent inbox approvals post exactly once', async () => {
    const s = await seedScenario()
    const board = await mintUser(s.org, 'board')
    const admin = await mintUser(s.org, 'admin')
    const result = await bankReconciliationAgent.execute({ bankTransactionId: s.txnId }, { organizationId: s.org.orgId })
    const id = result.output.approvalRequestId!

    const outcomes = await Promise.all([
      decideApprovalFor('board', { kind: 'w18', id, decision: 'approve' }, { ...postingHandlers(board.client, adminDb()), ...OTHER_HANDLERS }),
      decideApprovalFor('admin', { kind: 'w18', id, decision: 'approve' }, { ...postingHandlers(admin.client, adminDb()), ...OTHER_HANDLERS }),
    ])
    expect(outcomes.every((o) => o.ok)).toBe(true)
    expect(await ledgerState(s)).toMatchObject({ journalEntries: 1, payments: 1 })
  })

  it('a resident sees no section rows and cannot approve from the inbox', async () => {
    const s = await seedScenario()
    const resident = await mintUser(s.org, 'resident')
    const result = await bankReconciliationAgent.execute({ bankTransactionId: s.txnId }, { organizationId: s.org.orgId })
    const id = result.output.approvalRequestId!

    // RLS hides approval_requests from residents entirely.
    expect(await loadW18Section(resident.client, s.org.orgId)).toMatchObject({ ok: true, total: 0 })

    // Even with a forged role claim reaching the dispatcher, the RPC refuses.
    const forged = await decideApprovalFor(
      'board',
      { kind: 'w18', id, decision: 'approve' },
      { ...postingHandlers(resident.client, adminDb()), ...OTHER_HANDLERS, approveVendor: async () => ({ ok: true as const }) },
    )
    expect(forged.ok).toBe(false)
    expect(await ledgerState(s)).toMatchObject({ journalEntries: 0, payments: 0, assessmentStatus: 'open' })
  })
})
