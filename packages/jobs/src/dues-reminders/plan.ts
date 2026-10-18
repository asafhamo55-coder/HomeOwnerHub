/**
 * Who gets an automated dues reminder today (BL-013). Pure.
 *
 * TRIGGER. A `regular` or `special` assessment with a balance left, whose
 * due date plus a configured offset is today (schedule.ts `dueStep`). Late
 * fees, fines and collection costs never trigger a reminder of their own —
 * the late-fee cron writes one every night, and a reminder per fee would be
 * spam — but they DO appear in the email body, because it shows the unit's
 * whole open balance, exactly like the manual reminder on /dues.
 *
 * SKIPS (counted, never silent):
 *   - paymentPlan  the unit has a payment_plans row with status 'active'.
 *                  A plan paid in full is completed before planning
 *                  (BL-080, run.ts), so the skip ends with the plan; a
 *                  plan that is behind still skips — there is no plan
 *                  reminder yet, and the board sees "Behind on plan"
 *   - attorney     the unit has an open collection_cases row at the
 *                  attorney stage ('attorney_presuit' or 'suit_filed') —
 *                  once counsel has the account, the association should
 *                  not be mailing the owner directly about the debt
 *   - alreadySent  this (assessment, step) has a communications row
 *   - noRecipient  no active owner of the unit has an email
 *
 * One send per (assessment, step), to every active owner of the unit with
 * an email — co-owners are jointly liable, as in the manual reminder.
 */

import { daysBetween, dueStep, reminderCommunicationId } from './schedule'

/** Assessment types that trigger a reminder. */
export const REMINDER_TRIGGER_TYPES: readonly string[] = ['regular', 'special']

/** collection_cases.status values where the unit is skipped. */
export const ATTORNEY_STAGE_STATUSES: readonly string[] = ['board_authorized_suit', 'attorney_presuit', 'suit_filed']

export interface PlanAssessment {
  id: string
  unitId: string
  /** Display label of the unit ("14 Oak St · Unit B"). Never logged. */
  unitLabel: string
  dueDate: string
  amount: number
  paid: number
  assessmentType: string
}

export interface PlanOwnership {
  unitId: string
  ownerName: string | null
  ownerEmail: string | null
  ownerUserId: string | null
}

/** Same shape as apps/hoa's ReminderCharge, so the app renders it as-is. */
export interface PlannedCharge {
  id: string
  assessmentType: string
  dueDate: string
  amount: number
  paid: number
  balance: number
  pastDue: boolean
  daysLate: number
}

export interface PlannedRecipient {
  email: string
  name: string
  userId: string | null
}

export interface PlannedSend {
  /** Deterministic communications.id — the idempotency key. */
  communicationId: string
  assessmentId: string
  unitId: string
  unitLabel: string
  step: number
  dueDate: string
  recipients: PlannedRecipient[]
  /** Every open charge on the unit, past due first. */
  charges: PlannedCharge[]
}

export interface PlanSkips {
  paymentPlan: number
  attorney: number
  alreadySent: number
  noRecipient: number
}

export interface PlanResult {
  sends: PlannedSend[]
  skipped: PlanSkips
}

export interface Candidate {
  assessment: PlanAssessment
  step: number
  communicationId: string
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function balanceOf(a: PlanAssessment): number {
  return round(Number(a.amount) - Number(a.paid))
}

/** Assessments with a step firing today. Sorted by due date then id. */
export function candidateReminders(
  assessments: readonly PlanAssessment[],
  today: string,
  offsets: readonly number[],
): Candidate[] {
  const out: Candidate[] = []
  for (const a of assessments) {
    if (!REMINDER_TRIGGER_TYPES.includes(a.assessmentType)) continue
    if (balanceOf(a) <= 0) continue
    const step = dueStep(a.dueDate, today, offsets)
    if (step === null) continue
    out.push({ assessment: a, step, communicationId: reminderCommunicationId(a.id, step) })
  }
  return out.sort(
    (x, y) => x.assessment.dueDate.localeCompare(y.assessment.dueDate) || x.assessment.id.localeCompare(y.assessment.id),
  )
}

function chargesByUnit(assessments: readonly PlanAssessment[], today: string): Map<string, PlannedCharge[]> {
  const byUnit = new Map<string, PlannedCharge[]>()
  for (const a of assessments) {
    const balance = balanceOf(a)
    if (balance <= 0) continue
    const late = daysBetween(a.dueDate, today)
    const pastDue = Number.isFinite(late) && late > 0
    const charge: PlannedCharge = {
      id: a.id,
      assessmentType: a.assessmentType,
      dueDate: a.dueDate,
      amount: round(Number(a.amount)),
      paid: round(Number(a.paid)),
      balance,
      pastDue,
      daysLate: pastDue ? late : 0,
    }
    const list = byUnit.get(a.unitId) ?? []
    list.push(charge)
    byUnit.set(a.unitId, list)
  }
  for (const list of byUnit.values()) {
    list.sort((x, y) => (x.pastDue !== y.pastDue ? (x.pastDue ? -1 : 1) : x.dueDate.localeCompare(y.dueDate)))
  }
  return byUnit
}

function recipientsByUnit(ownerships: readonly PlanOwnership[]): Map<string, PlannedRecipient[]> {
  const byUnit = new Map<string, PlannedRecipient[]>()
  for (const o of ownerships) {
    const email = o.ownerEmail?.trim().toLowerCase()
    if (!email) continue
    const list = byUnit.get(o.unitId) ?? []
    if (list.some((r) => r.email === email)) continue
    list.push({ email, name: o.ownerName?.trim() || 'Owner', userId: o.ownerUserId })
    byUnit.set(o.unitId, list)
  }
  return byUnit
}

export function planReminders(input: {
  today: string
  offsets: readonly number[]
  assessments: readonly PlanAssessment[]
  ownerships: readonly PlanOwnership[]
  activePlanUnitIds: ReadonlySet<string>
  attorneyUnitIds: ReadonlySet<string>
  /** communications ids that already exist (sent or claimed). */
  sentIds: ReadonlySet<string>
}): PlanResult {
  const skipped: PlanSkips = { paymentPlan: 0, attorney: 0, alreadySent: 0, noRecipient: 0 }
  const charges = chargesByUnit(input.assessments, input.today)
  const recipients = recipientsByUnit(input.ownerships)
  const sends: PlannedSend[] = []

  for (const c of candidateReminders(input.assessments, input.today, input.offsets)) {
    const unitId = c.assessment.unitId
    if (input.activePlanUnitIds.has(unitId)) {
      skipped.paymentPlan += 1
      continue
    }
    if (input.attorneyUnitIds.has(unitId)) {
      skipped.attorney += 1
      continue
    }
    if (input.sentIds.has(c.communicationId)) {
      skipped.alreadySent += 1
      continue
    }
    const to = recipients.get(unitId) ?? []
    if (to.length === 0) {
      skipped.noRecipient += 1
      continue
    }
    sends.push({
      communicationId: c.communicationId,
      assessmentId: c.assessment.id,
      unitId,
      unitLabel: c.assessment.unitLabel,
      step: c.step,
      dueDate: c.assessment.dueDate,
      recipients: to,
      charges: charges.get(unitId) ?? [],
    })
  }
  return { sends, skipped }
}
