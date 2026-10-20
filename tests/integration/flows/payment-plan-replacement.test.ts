/**
 * Payment plan double count (2026-10-19): a plan replaces the charges it
 * spreads, so creating one leaves the unit's AR and income unchanged.
 *
 * Against real Postgres, because postJournalEntry plus the
 * validate_je_balances trigger (overall and per fund, migration 0006) and
 * the conditional status claim are what is under test. Runs in CI only
 * (ephemeral DB); seeded with the service role.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { postJournalEntry } from '../../../packages/db/src'
import {
  createPlanWithLedger,
  installmentFromMemo,
  loadReplacedChargeCounts,
  planKey,
  replacedChargeFromMemo,
  supabasePlanStore,
} from '../../../packages/workflows/src/payment-plans'
import { adminDb, makeAccounting, makeOrg, makeUnit, type AccountingRefs, type OrgFixture } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const TODAY = `${new Date().getFullYear()}-06-15`

function refsOf(acct: AccountingRefs) {
  return {
    fundOperating: acct.fundIds.OPERATING,
    acctAR: acct.accountIds['1100']!,
    acctAssessmentIncome: acct.accountIds['4000']!,
    acctLateFeeIncome: acct.accountIds['4100']!,
  }
}

async function bill(org: OrgFixture, acct: AccountingRefs, unitId: string, type: string, due: string, amount: number): Promise<string> {
  const db = adminDb()
  const { data: a, error } = await db
    .from('assessments')
    .insert({ organization_id: org.orgId, association_id: org.associationId, unit_id: unitId, fiscal_period_id: acct.fiscalPeriodId, assessment_type: type, amount, due_date: due, status: 'open' })
    .select('id')
    .single()
  if (error || !a) throw new Error(`assessment insert failed: ${error?.message}`)
  const je = await postJournalEntry(db, {
    organizationId: org.orgId,
    associationId: org.associationId,
    fiscalPeriodId: acct.fiscalPeriodId,
    entryDate: due,
    memo: `billed ${type}`,
    source: 'ar_payment',
    sourceId: a.id,
    lines: [
      { accountId: acct.accountIds['1100']!, fundId: acct.fundIds.OPERATING, debit: amount, credit: 0 },
      { accountId: acct.accountIds[type === 'late_fee' ? '4100' : '4000']!, fundId: acct.fundIds.OPERATING, debit: 0, credit: amount },
    ],
  })
  if (!je.ok) throw new Error(`billing JE failed: ${je.error}`)
  return a.id
}

/** Debits minus credits, in cents, on posted-or-reversed lines for the association. */
async function balanceCents(org: OrgFixture, accountId: string): Promise<number> {
  const { data, error } = await adminDb()
    .from('ledger_entries')
    .select('debit_amount, credit_amount, je:journal_entry_id!inner(association_id, status)')
    .eq('account_id', accountId)
    .eq('je.association_id', org.associationId)
  if (error) throw new Error(`ledger read failed: ${error.message}`)
  return (data ?? []).reduce((t, l) => t + Math.round(Number(l.debit_amount) * 100) - Math.round(Number(l.credit_amount) * 100), 0)
}

describe('payment plan replaces the charges it spreads', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('AR and income are unchanged, every entry posts balanced, and the links read back', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const unitId = await makeUnit(org)
    const refs = refsOf(acct)
    const y = TODAY.slice(0, 4)
    const dues = await bill(org, acct, unitId, 'regular', `${y}-03-31`, 300)
    const fee = await bill(org, acct, unitId, 'late_fee', `${y}-04-15`, 15)

    const before = {
      ar: await balanceCents(org, refs.acctAR),
      income: (await balanceCents(org, refs.acctAssessmentIncome)) + (await balanceCents(org, refs.acctLateFeeIncome)),
    }

    const db = adminDb()
    const store = supabasePlanStore(db, {
      organizationId: org.orgId,
      associationId: org.associationId,
      fiscalPeriodId: acct.fiscalPeriodId,
      entryDate: TODAY,
      installmentMemoCode: null,
    })
    const r = await createPlanWithLedger(store, refs, { unitId, chargeIds: [dues, fee], installmentCount: 3, startDate: `${y}-01-31`, expectedTotalCents: 31_500 })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(await balanceCents(org, refs.acctAR)).toBe(before.ar)
    expect((await balanceCents(org, refs.acctAssessmentIncome)) + (await balanceCents(org, refs.acctLateFeeIncome))).toBe(before.income)

    const { data: originals } = await db.from('assessments').select('id, status').in('id', [dues, fee])
    expect((originals ?? []).map((o) => o.status)).toEqual(['waived', 'waived'])

    const { data: installments } = await db.from('assessments').select('due_date, amount, status').in('id', r.installmentIds).order('due_date')
    const leap = Number(y) % 4 === 0 && (Number(y) % 100 !== 0 || Number(y) % 400 === 0)
    expect((installments ?? []).map((i) => i.due_date)).toEqual([`${y}-01-31`, `${y}-02-${leap ? '29' : '28'}`, `${y}-03-31`])
    expect((installments ?? []).reduce((t, i) => t + Math.round(Number(i.amount) * 100), 0)).toBe(31_500)

    const { data: jes } = await db.from('journal_entries').select('memo, status').eq('association_id', org.associationId).eq('status', 'posted')
    const key = planKey(r.planId)
    expect((jes ?? []).filter((e) => replacedChargeFromMemo(e.memo)?.key === key)).toHaveLength(2)
    expect((jes ?? []).filter((e) => installmentFromMemo(e.memo)?.key === key)).toHaveLength(3)
    expect((await loadReplacedChargeCounts(db, org.associationId)).get(key)).toBe(2)
  })

  it('a charge already closed is refused and nothing is written', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const unitId = await makeUnit(org)
    const dues = await bill(org, acct, unitId, 'regular', `${TODAY.slice(0, 4)}-03-01`, 300)
    const db = adminDb()
    await db.from('assessments').update({ status: 'paid' }).eq('id', dues)
    const store = supabasePlanStore(db, { organizationId: org.orgId, associationId: org.associationId, fiscalPeriodId: acct.fiscalPeriodId, entryDate: TODAY, installmentMemoCode: null })
    const r = await createPlanWithLedger(store, refsOf(acct), { unitId, chargeIds: [dues], installmentCount: 2, startDate: TODAY })
    expect(r.ok).toBe(false)
    const { data: plans } = await db.from('payment_plans').select('id').eq('unit_id', unitId)
    expect(plans ?? []).toHaveLength(0)
  })
})
