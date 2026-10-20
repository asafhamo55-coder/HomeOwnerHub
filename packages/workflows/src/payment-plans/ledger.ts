/**
 * The journal entries a payment plan posts (2026-10-19 fix). Pure.
 *
 * THE BUG. Until 2026-10-19 a plan posted one Dr AR / Cr Assessment Income
 * entry per installment and left the charges it spread open, so the
 * owner's balance, AR and income were all counted twice.
 *
 * THE FIX. The board picks the open charges the plan replaces; the plan's
 * total is what is still open on them. In the same operation:
 *
 *   for each replaced charge, on what is still open on it:
 *       Dr Income (4000, or 4100 for a late fee)   Cr AR (1100)   OPERATING
 *     memo replacedChargeMemo(plan), source_id = the replaced charge;
 *     the charge is marked 'waived' (the closed status every reader of
 *     balances, aging, letters and reminders already skips).
 *
 *   for each installment (unchanged since BL-080, so its memo link holds):
 *       Dr AR (1100)   Cr Assessment Income (4000)   OPERATING
 *     memo installmentMemo(i, n, plan), source_id = the installment.
 *
 * Net effect of creating a plan: AR +0, income +0. The income the original
 * charges recognised is moved onto the installments, never added again.
 * Every entry has two lines in the OPERATING fund, so each balances overall
 * and per fund (the validate_je_balances trigger, migration 0006). Every
 * charge path in the app bills OPERATING, so closing against OPERATING
 * mirrors the entry that billed the charge.
 *
 * Partly paid charges are closed for what is left: the payments already
 * applied stay on the charge they paid.
 */
import { installmentMemo, replacedChargeMemo } from './progress'
import { installmentSchedule, type ScheduledInstallment } from './schedule'

export interface PlanLedgerRefs {
  fundOperating: string
  acctAR: string
  acctAssessmentIncome: string
  acctLateFeeIncome: string
}

export interface PlanCharge {
  id: string
  assessmentType: string
  dueDate: string
  amountCents: number
  /** Sum of the payments applied to this charge (refunds are negative). */
  paidCents: number
  status: string
  deleted: boolean
}

export interface PlanLine {
  accountId: string
  fundId: string
  debit: number
  credit: number
}

export interface PlannedInstallment extends ScheduledInstallment {
  memo: string
  lines: PlanLine[]
}

export interface PlannedReplacement {
  chargeId: string
  openCents: number
  memo: string
  lines: PlanLine[]
}

export interface PlanLedger {
  totalCents: number
  installments: PlannedInstallment[]
  replacements: PlannedReplacement[]
}

/** Statuses a plan may replace: still owed. */
export const REPLACEABLE_STATUSES: readonly string[] = ['open', 'partial']

/** The status a replaced charge is closed with. */
export const REPLACED_STATUS = 'waived'

/** What is still owed on a charge, in cents (never negative). */
export function openCents(c: Pick<PlanCharge, 'amountCents' | 'paidCents' | 'status' | 'deleted'>): number {
  if (c.deleted || !REPLACEABLE_STATUSES.includes(c.status)) return 0
  return Math.max(0, c.amountCents - c.paidCents)
}

export function isReplaceable(c: PlanCharge): boolean {
  return openCents(c) > 0
}

/** Open charges preselected on the form: due before the association's today. */
export function isPastDue(c: PlanCharge, today: string): boolean {
  return isReplaceable(c) && c.dueDate < today
}

const dollars = (c: number) => Math.round(c) / 100

export function incomeAccountFor(assessmentType: string, refs: PlanLedgerRefs): string {
  return assessmentType === 'late_fee' ? refs.acctLateFeeIncome : refs.acctAssessmentIncome
}

export function planLedger(input: {
  planId: string
  startDate: string
  installmentCount: number
  charges: readonly PlanCharge[]
  refs: PlanLedgerRefs
}): PlanLedger {
  const { refs } = input
  const replacements: PlannedReplacement[] = input.charges.map((c) => {
    const open = openCents(c)
    return {
      chargeId: c.id,
      openCents: open,
      memo: replacedChargeMemo(input.planId),
      lines: [
        { accountId: incomeAccountFor(c.assessmentType, refs), fundId: refs.fundOperating, debit: dollars(open), credit: 0 },
        { accountId: refs.acctAR, fundId: refs.fundOperating, debit: 0, credit: dollars(open) },
      ],
    }
  })
  const totalCents = replacements.reduce((t, r) => t + r.openCents, 0)
  const installments = installmentSchedule(input.startDate, input.installmentCount, totalCents).map((s) => ({
    ...s,
    memo: installmentMemo(s.index, input.installmentCount, input.planId),
    lines: [
      { accountId: refs.acctAR, fundId: refs.fundOperating, debit: dollars(s.amountCents), credit: 0 },
      { accountId: refs.acctAssessmentIncome, fundId: refs.fundOperating, debit: 0, credit: dollars(s.amountCents) },
    ],
  }))
  return { totalCents, installments, replacements }
}
