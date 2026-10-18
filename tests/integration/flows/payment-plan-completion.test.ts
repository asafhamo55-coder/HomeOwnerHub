/**
 * BL-080: a payment plan completes once its installments are paid.
 *
 * Against real Postgres, because the link this depends on is real data:
 * the installment charge's journal entry (source 'ar_payment', source_id
 * = the assessment, memo from installmentMemo) — exactly what
 * createPaymentPlan writes — and the payments rows applied to each
 * charge. Seeded with the service role; dates are explicit.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { postJournalEntry } from '../../../packages/db/src'
import { completePaidOffPlans, installmentMemo, loadCompletionDays } from '../../../packages/workflows/src/payment-plans'
import { adminDb, makeAccounting, makeOrg, makeUnit, type AccountingRefs, type OrgFixture } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const TODAY = '2026-10-15'

async function seedPlan(org: OrgFixture, acct: AccountingRefs, unitId: string, count: number): Promise<{ planId: string; assessmentIds: string[] }> {
  const db = adminDb()
  const { data: plan, error } = await db
    .from('payment_plans')
    .insert({
      organization_id: org.orgId,
      unit_id: unitId,
      total_amount: 100 * count,
      installment_count: count,
      installment_amount: 100,
      start_date: '2026-08-01',
      status: 'active',
    })
    .select('id')
    .single()
  if (error || !plan) throw new Error(`plan insert failed: ${error?.message}`)

  const assessmentIds: string[] = []
  for (let i = 0; i < count; i++) {
    const { data: a, error: aErr } = await db
      .from('assessments')
      .insert({
        organization_id: org.orgId,
        association_id: org.associationId,
        unit_id: unitId,
        fiscal_period_id: acct.fiscalPeriodId,
        assessment_type: 'special',
        amount: 100,
        due_date: `2026-${String(8 + i).padStart(2, '0')}-01`,
        status: 'open',
      })
      .select('id')
      .single()
    if (aErr || !a) throw new Error(`installment insert failed: ${aErr?.message}`)
    assessmentIds.push(a.id)
    const je = await postJournalEntry(db, {
      organizationId: org.orgId,
      associationId: org.associationId,
      fiscalPeriodId: acct.fiscalPeriodId,
      entryDate: '2026-08-01',
      memo: installmentMemo(i + 1, count, plan.id),
      source: 'ar_payment',
      sourceId: a.id,
      lines: [
        { accountId: acct.accountIds['1100'] ?? acct.accountIds['1010'], fundId: acct.fundIds.OPERATING, debit: 100, credit: 0 },
        { accountId: acct.accountIds['4000'], fundId: acct.fundIds.OPERATING, debit: 0, credit: 100 },
      ],
    })
    if (!je.ok) throw new Error(`installment JE failed: ${je.error}`)
  }
  return { planId: plan.id, assessmentIds }
}

async function pay(org: OrgFixture, unitId: string, assessmentId: string, amount: number) {
  const { error } = await adminDb().from('payments').insert({
    organization_id: org.orgId,
    unit_id: unitId,
    assessment_id: assessmentId,
    amount,
    payment_method: 'check',
    paid_at: `${TODAY}T12:00:00Z`,
  })
  if (error) throw new Error(`payment insert failed: ${error.message}`)
}

describe('payment plan completion (BL-080)', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('stays active until the last installment is paid, then completes once with an audit row', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const unitId = await makeUnit(org)
    const { planId, assessmentIds } = await seedPlan(org, acct, unitId, 2)
    const input = { organizationId: org.orgId, associationId: org.associationId, today: TODAY, actorUserId: null, trigger: 'nightly' as const }

    await pay(org, unitId, assessmentIds[0], 100)
    expect((await completePaidOffPlans(adminDb(), input)).completed).toEqual([])

    await pay(org, unitId, assessmentIds[1], 60)
    await pay(org, unitId, assessmentIds[1], 40)
    expect((await completePaidOffPlans(adminDb(), { ...input, unitIds: [unitId] })).completed).toEqual([planId])

    const { data: plan } = await adminDb().from('payment_plans').select('status').eq('id', planId).single()
    expect(plan?.status).toBe('completed')
    expect((await loadCompletionDays(adminDb(), org.orgId, [planId])).get(planId)).toBe(TODAY)

    // A second run is a no-op: no second audit row.
    expect((await completePaidOffPlans(adminDb(), input)).completed).toEqual([])
    const { data: audits } = await adminDb().from('audit_log').select('id').eq('entity_id', planId).eq('action', 'payment_plan.completed')
    expect(audits ?? []).toHaveLength(1)
  })
})
