// The estoppel / resale certificate for one home (BL-087), as data.
//
// Pure and client-safe: the page loads the rows (load.ts), this turns them
// into the figures and the list of fields, and the certificate component
// shows them. Money is in integer cents throughout; nothing here reads a
// clock (the issue day is passed in, on the association's calendar).
//
// Any fact the app does not hold is a BLANK: a field with `value: null`.
// The board fills every BLANK before the certificate can be printed
// (blanksLeft), the same rule as the ARC decision letters' [[BLANK: …]].

import { buildLedger, type LedgerAssessment, type LedgerPayment } from '@/lib/resident-ledger'
import { chargeTypeLabel } from '@/lib/assessment-labels'
import { formatDay } from '@/lib/money/format'
import { collectionStatusLabel, isTerminal, type CollectionStatus } from '@/lib/collections/statuses'
import { addBusinessDays, addCalendarDays, addMonths, holidaysBetween, isIsoDay, type Holiday } from './business-days'
import {
  CA_RESPONSE_DAYS,
  FL_EXPEDITED_BUSINESS_DAYS,
  FL_RESPONSE_BUSINESS_DAYS,
  flEffectiveDays,
  flFeeCap,
  type FeeCap,
  type FlDelivery,
} from './law'

// ─── input ───────────────────────────────────────────────────────────

export type Jurisdiction = 'FL' | 'CA' | 'generic'

export function jurisdictionOf(state: string | null | undefined): Jurisdiction {
  const s = (state ?? '').trim().toUpperCase()
  return s === 'FL' ? 'FL' : s === 'CA' ? 'CA' : 'generic'
}

export interface EstoppelViolation {
  id: string
  description: string
  status: string
  noticeSentAt: string | null
  resolvedAt: string | null
}

export interface EstoppelPlan {
  id: string
  status: string
  installmentAmount: number
  installmentCount: number
  totalAmount: number
  startDate: string
}

export interface EstoppelCase {
  id: string
  status: CollectionStatus
  attorneyFirm: string | null
}

export interface EstoppelInput {
  state: string | null
  associationName: string | null
  propertyId: string
  address: string
  unitNumber: string | null
  unitId: string | null
  lotNumber: string | null
  /** Owners of record today (ownerships), else the home's own owner name. */
  owners: string[]
  charges: LedgerAssessment[]
  payments: LedgerPayment[]
  violations: EstoppelViolation[]
  plans: EstoppelPlan[]
  collectionCase: EstoppelCase | null
  timeZone: string
}

export interface EstoppelRequest {
  /** The day the association received the request (the board enters it). */
  requestDate: string
  /** The day the certificate is issued: the association's today. */
  issueDate: string
  delivery: FlDelivery
  expedited: boolean
}

// ─── money ───────────────────────────────────────────────────────────

const cents = (n: number) => Math.round(Number(n) * 100)
const CLOSED = new Set(['waived', 'written_off', 'paid'])

export interface ChargeLine {
  id: string
  dueDate: string
  label: string
  type: string
  amountCents: number
  remainingCents: number
}

/** What is left on each charge: closed charges owe nothing, as in the ledger. */
export function chargeLines(input: Pick<EstoppelInput, 'charges' | 'payments' | 'plans'>): ChargeLine[] {
  const paid = new Map<string, number>()
  for (const p of input.payments) {
    if (p.assessment_id) paid.set(p.assessment_id, (paid.get(p.assessment_id) ?? 0) + cents(p.amount))
  }
  const installments = planInstallmentKeys(input.plans)
  return input.charges
    .map((c) => {
      const amountCents = cents(c.amount)
      const remainingCents = CLOSED.has(c.status) ? 0 : Math.max(0, amountCents - (paid.get(c.id) ?? 0))
      const isInstallment = c.assessment_type === 'special' && installments.has(`${c.due_date}:${amountCents}`)
      return {
        id: c.id,
        dueDate: c.due_date,
        type: isInstallment ? 'plan_installment' : c.assessment_type,
        label: isInstallment ? 'Payment plan installment' : chargeTypeLabel(c.assessment_type),
        amountCents,
        remainingCents,
      }
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
}

/**
 * Payment plan installments are stored as 'special' charges
 * (lib/payment-plans.ts): monthly from the start date, the drift on the
 * last one. A special charge on one of those days for that amount is the
 * plan's, not a special assessment.
 */
function planInstallmentKeys(plans: EstoppelPlan[]): Set<string> {
  const keys = new Set<string>()
  for (const p of plans) {
    if (!isIsoDay(p.startDate) || p.installmentCount < 1) continue
    const each = cents(p.installmentAmount)
    const last = cents(p.totalAmount) - each * (p.installmentCount - 1)
    for (let i = 0; i < p.installmentCount; i++) {
      keys.add(`${addMonths(p.startDate, i)}:${i === p.installmentCount - 1 ? last : each}`)
    }
  }
  return keys
}

// ─── regular assessment ──────────────────────────────────────────────

export type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual'

export const FREQUENCY_MONTHS: Record<Frequency, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }
export const FREQUENCY_LABELS: Record<Frequency, string> = { monthly: 'month', quarterly: 'quarter', semiannual: 'half-year', annual: 'year' }

/** Months from a to b when b is a whole number of months after a (±3 days), else null. */
function wholeMonths(a: string, b: string): number | null {
  for (const k of [1, 3, 6, 12]) {
    const expected = addMonths(a, k)
    const diff = Math.abs(Date.parse(`${expected}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
    if (diff <= 3) return k
  }
  return null
}

/**
 * The frequency the regular charges follow: the last few gaps between
 * due dates must all agree. One charge, or uneven gaps, is unknown
 * (a BLANK the board fills), never a guess.
 */
export function inferFrequency(regular: ChargeLine[]): Frequency | null {
  const days = [...new Set(regular.map((c) => c.dueDate))].sort()
  if (days.length < 2) return null
  const recent = days.slice(-5)
  const gaps = recent.slice(1).map((d, i) => wholeMonths(recent[i]!, d))
  const first = gaps[0]
  if (first == null || gaps.some((g) => g !== first)) return null
  return (Object.entries(FREQUENCY_MONTHS).find(([, m]) => m === first)?.[0] as Frequency | undefined) ?? null
}

export type PaidThrough =
  | { kind: 'date'; day: string }
  /** No regular installment has been paid; the first unpaid one was due this day. */
  | { kind: 'none'; firstUnpaidDue: string }
  /** Can't tell (no regular charges, or the period length is unknown). */
  | { kind: 'unknown' }

/**
 * The end of the last period paid without a gap. Installments settle in
 * due-date order; the first unpaid one ends the run. The period ends the
 * day before the next installment is due, or one frequency on when the
 * next is not billed yet.
 */
export function paidThrough(regular: ChargeLine[], frequency: Frequency | null): PaidThrough {
  if (regular.length === 0) return { kind: 'unknown' }
  const firstUnpaid = regular.findIndex((c) => c.remainingCents > 0)
  if (firstUnpaid === 0) return { kind: 'none', firstUnpaidDue: regular[0]!.dueDate }
  if (firstUnpaid > 0) return { kind: 'date', day: addCalendarDays(regular[firstUnpaid]!.dueDate, -1) }
  if (!frequency) return { kind: 'unknown' }
  const last = regular[regular.length - 1]!
  return { kind: 'date', day: addCalendarDays(addMonths(last.dueDate, FREQUENCY_MONTHS[frequency]), -1) }
}

// ─── deadlines ───────────────────────────────────────────────────────

export interface Deadlines {
  requestDate: string
  issueDate: string
  /** FL: 10 business days after the request. CA: 10 days. Generic: null. */
  responseDue: string | null
  responseRule: string | null
  /** Federal holidays skipped in counting the FL response deadline. */
  holidaysSkipped: Holiday[]
  /** FL: the day an expedited certificate must be delivered by. */
  expeditedDue: string | null
  /** FL § 720.30851(2): 30 or 35 days. */
  effectiveDays: number | null
  effectiveThrough: string | null
  /** Issued after the response deadline (FL: no fee may be charged). */
  late: boolean
  /** Asked for expedited but issued after 3 business days: no expedited fee. */
  expeditedMissed: boolean
}

export function deadlines(j: Jurisdiction, req: EstoppelRequest): Deadlines {
  const { requestDate, issueDate } = req
  if (j === 'FL') {
    const responseDue = addBusinessDays(requestDate, FL_RESPONSE_BUSINESS_DAYS)
    const expeditedDue = addBusinessDays(requestDate, FL_EXPEDITED_BUSINESS_DAYS)
    const effectiveDays = flEffectiveDays(req.delivery)
    return {
      requestDate,
      issueDate,
      responseDue,
      responseRule: `${FL_RESPONSE_BUSINESS_DAYS} business days after the request (§ 720.30851)`,
      holidaysSkipped: holidaysBetween(requestDate, responseDue),
      expeditedDue,
      effectiveDays,
      effectiveThrough: addCalendarDays(issueDate, effectiveDays),
      late: issueDate > responseDue,
      expeditedMissed: req.expedited && issueDate > expeditedDue,
    }
  }
  if (j === 'CA') {
    const responseDue = addCalendarDays(requestDate, CA_RESPONSE_DAYS)
    return {
      requestDate,
      issueDate,
      responseDue,
      responseRule: `${CA_RESPONSE_DAYS} days after the request was mailed or delivered (§ 4530(a)(1))`,
      holidaysSkipped: [],
      expeditedDue: null,
      effectiveDays: null,
      effectiveThrough: null,
      late: issueDate > responseDue,
      expeditedMissed: false,
    }
  }
  return {
    requestDate,
    issueDate,
    responseDue: null,
    responseRule: null,
    holidaysSkipped: [],
    expeditedDue: null,
    effectiveDays: null,
    effectiveThrough: null,
    late: false,
    expeditedMissed: false,
  }
}

// ─── figures ─────────────────────────────────────────────────────────

const OPEN_VIOLATION_EXCLUDED = new Set(['resolved', 'dismissed', 'cured', 'closed'])

export interface Figures {
  /** Everything owed on the issue day (charges due by then, less payments and credits). */
  currentBalanceCents: number
  /** Charges due before the issue day that are still unpaid. */
  pastDueCents: number
  delinquent: boolean
  /** Unpaid charges due on or before the issue day, oldest first. */
  owedItems: ChargeLine[]
  /** Payments and credits not applied to a charge (negative, or 0). */
  unappliedCents: number
  /** Unpaid charges due after the issue day. */
  notYetDue: (ChargeLine & { withinEffectivePeriod: boolean })[]
  notYetDueCents: number
  regular: { amountCents: number | null; frequency: Frequency | null }
  paidThrough: PaidThrough
  nextInstallment: { dueDate: string; amountCents: number; billed: boolean } | null
  /** Special assessments (not plan installments) still unpaid, due or not. */
  specials: ChargeLine[]
  openViolations: (EstoppelViolation & { noticed: boolean })[]
  activePlan: EstoppelPlan | null
  collections: { caseId: string; status: CollectionStatus; stage: string; withAttorney: boolean; attorneyFirm: string | null } | null
}

export function computeFigures(input: EstoppelInput, issueDate: string, effectiveThrough: string | null): Figures {
  const lines = chargeLines(input)
  const ledger = buildLedger(input.charges, input.payments, input.timeZone)
  const totalCents = cents(ledger.totals.balance)

  const owedItems = lines.filter((l) => l.dueDate <= issueDate && l.remainingCents > 0)
  const future = lines.filter((l) => l.dueDate > issueDate && l.remainingCents > 0)
  const notYetDueCents = future.reduce((t, l) => t + l.remainingCents, 0)
  // Total balance less what is not due yet: a prepayment on a future
  // charge stays a credit today rather than vanishing.
  const currentBalanceCents = totalCents - notYetDueCents
  const owedCents = owedItems.reduce((t, l) => t + l.remainingCents, 0)
  const pastDueCents = lines.filter((l) => l.dueDate < issueDate && l.remainingCents > 0).reduce((t, l) => t + l.remainingCents, 0)

  const regularLines = lines.filter((l) => l.type === 'regular')
  const frequency = inferFrequency(regularLines)
  const lastRegular = regularLines[regularLines.length - 1] ?? null
  const billedNext = regularLines.find((l) => l.dueDate > issueDate) ?? null
  const nextInstallment = billedNext
    ? { dueDate: billedNext.dueDate, amountCents: billedNext.amountCents, billed: true }
    : lastRegular && frequency
      ? (() => {
          let due = lastRegular.dueDate
          while (due <= issueDate) due = addMonths(due, FREQUENCY_MONTHS[frequency])
          return { dueDate: due, amountCents: lastRegular.amountCents, billed: false }
        })()
      : null

  const openCase = input.collectionCase && !isTerminal(input.collectionCase.status) ? input.collectionCase : null
  const withAttorney = (s: CollectionStatus) => s === 'attorney_presuit' || s === 'suit_filed'

  return {
    currentBalanceCents,
    pastDueCents,
    delinquent: pastDueCents > 0,
    owedItems,
    unappliedCents: currentBalanceCents - owedCents,
    notYetDue: future.map((l) => ({ ...l, withinEffectivePeriod: effectiveThrough !== null && l.dueDate <= effectiveThrough })),
    notYetDueCents,
    regular: { amountCents: lastRegular?.amountCents ?? null, frequency },
    paidThrough: paidThrough(regularLines, frequency),
    nextInstallment,
    specials: lines.filter((l) => l.type === 'special' && l.remainingCents > 0),
    openViolations: input.violations
      .filter((v) => !v.resolvedAt && !OPEN_VIOLATION_EXCLUDED.has(v.status))
      .map((v) => ({ ...v, noticed: v.noticeSentAt !== null || v.status === 'notice_sent' || v.status === 'fined' })),
    activePlan: input.plans.find((p) => p.status === 'active') ?? null,
    collections: openCase
      ? {
          caseId: openCase.id,
          status: openCase.status,
          stage: collectionStatusLabel(openCase.status),
          withAttorney: withAttorney(openCase.status) || !!openCase.attorneyFirm?.trim(),
          attorneyFirm: openCase.attorneyFirm?.trim() || null,
        }
      : null,
  }
}

// ─── fields and BLANKs ───────────────────────────────────────────────

export type FieldKind = 'text' | 'textarea' | 'money' | 'yesno' | 'yesno_detail' | 'frequency' | 'day'

export interface CertificateField {
  key: string
  label: string
  kind: FieldKind
  /** Null = BLANK: the app does not know it and the board must fill it in. */
  value: string | null
  hint?: string
}

export const usdCents = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function fieldsFor(j: Jurisdiction, input: EstoppelInput, f: Figures): CertificateField[] {
  const owners = input.owners.map((o) => o.trim()).filter(Boolean)
  const parcel = input.lotNumber?.trim() ? `Lot ${input.lotNumber.trim()}` : null
  const fields: CertificateField[] = [
    { key: 'requestor', label: 'Name of the requestor', kind: 'text', value: null, hint: 'Who asked for the certificate: the owner, a buyer, a title company or a lender.' },
    { key: 'owners', label: 'Owner(s) of record', kind: 'text', value: owners.length > 0 ? owners.join('; ') : null },
    { key: 'parcel', label: 'Parcel designation', kind: 'text', value: parcel, hint: 'The lot number or parcel ID from the plat or the county property appraiser.' },
    {
      key: 'regularAmount',
      label: 'Regular assessment amount',
      kind: 'money',
      value: f.regular.amountCents !== null ? usdCents(f.regular.amountCents) : null,
    },
    { key: 'frequency', label: 'Regular assessment frequency', kind: 'frequency', value: f.regular.frequency ? FREQUENCY_LABELS[f.regular.frequency] : null },
    {
      key: 'paidThrough',
      label: 'Regular assessment paid through',
      kind: 'text',
      value:
        f.paidThrough.kind === 'date'
          ? formatDay(f.paidThrough.day)
          : f.paidThrough.kind === 'none'
            ? `Not paid (the installment due ${formatDay(f.paidThrough.firstUnpaidDue)} is unpaid)`
            : null,
    },
    {
      key: 'nextDue',
      label: 'Next regular installment (due date and amount)',
      kind: 'text',
      value: f.nextInstallment
        ? `${formatDay(f.nextInstallment.dueDate)}, ${usdCents(f.nextInstallment.amountCents)}${f.nextInstallment.billed ? '' : ' (not billed yet)'}`
        : null,
    },
    {
      key: 'transferFee',
      label: 'Capital contribution, resale, transfer or other fee due on sale',
      kind: 'yesno_detail',
      value: null,
      hint: 'From your declaration. If yes, give the type and amount.',
    },
    { key: 'fee', label: 'Fee charged for this certificate', kind: 'money', value: null },
    { key: 'signer', label: 'Signed by (name and title)', kind: 'text', value: null, hint: 'A board member, officer or authorized agent.' },
  ]
  if (j === 'FL') {
    fields.push(
      { key: 'parking', label: 'Parking or garage space number', kind: 'text', value: null, hint: 'Write “None” if none is assigned.' },
      { key: 'transferApproval', label: 'Must the board approve a transfer? If yes, has it approved this one?', kind: 'yesno_detail', value: null },
      { key: 'firstRefusal', label: 'Is there a right of first refusal? If yes, has it been exercised?', kind: 'yesno_detail', value: null },
      { key: 'otherAssociations', label: 'Other associations the parcel belongs to, with contact information', kind: 'textarea', value: null, hint: 'Write “None” if there are none.' },
      { key: 'insurance', label: 'Contact information for all insurance the association maintains', kind: 'textarea', value: null },
    )
    if (f.collections?.withAttorney) {
      fields.push({
        key: 'attorney',
        label: 'Collection attorney’s name and contact information',
        kind: 'textarea',
        value: null,
        hint: f.collections.attorneyFirm ? `The case names ${f.collections.attorneyFirm}. Add their contact information. No fee may be charged for this (§ 720.30851(1)(e)).` : 'The account is with an attorney. No fee may be charged for this (§ 720.30851(1)(e)).',
      })
    }
  }
  if (j === 'CA') {
    fields.push({
      key: 'approvedChanges',
      label: 'Changes to regular or special assessments the board has approved but are not yet due',
      kind: 'textarea',
      value: null,
      hint: '§ 4525(a)(8). Write “None” if there are none.',
    })
  }
  return fields
}

export type FieldValues = Record<string, string>

/** A board entry counts when it has text; yes/no with detail needs the detail after a Yes. */
function filled(field: CertificateField, entry: string | undefined): boolean {
  if (field.value !== null) return true
  const v = (entry ?? '').trim()
  if (!v) return false
  if (field.kind === 'yesno_detail' || field.kind === 'yesno') {
    if (v === 'No') return true
    if (field.kind === 'yesno') return v === 'Yes'
    return v.startsWith('Yes:') && v.slice(4).trim().length > 0
  }
  if (field.kind === 'money') return parseMoneyCents(v) !== null
  return true
}

/** Labels of every BLANK still unfilled. Printing waits until this is empty. */
export function blanksLeft(fields: CertificateField[], values: FieldValues): string[] {
  return fields.filter((f) => !filled(f, values[f.key])).map((f) => f.label)
}

export function valueOf(field: CertificateField, values: FieldValues): string | null {
  if (field.value !== null) return field.value
  const v = (values[field.key] ?? '').trim()
  if (!filled(field, v)) return null
  if (field.kind === 'money') return usdCents(parseMoneyCents(v)!)
  if (field.kind === 'yesno_detail' && v.startsWith('Yes:')) return `Yes — ${v.slice(4).trim()}`
  return v
}

export function parseMoneyCents(s: string): number | null {
  const t = s.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}

// ─── fee check ───────────────────────────────────────────────────────

export interface FeeCheck {
  cap: FeeCap | null
  /** A problem with the entered fee, or null. */
  problem: string | null
}

export function checkFee(j: Jurisdiction, d: Deadlines, f: Figures, req: EstoppelRequest, feeCents: number | null): FeeCheck {
  if (j !== 'FL') return { cap: null, problem: null }
  const cap = flFeeCap({ delinquent: f.delinquent, expedited: req.expedited && !d.expeditedMissed })
  if (feeCents === null) return { cap, problem: null }
  if (d.late && feeCents > 0) return { cap, problem: 'This certificate is issued after the 10-business-day deadline, so no fee may be charged (§ 720.30851(4)). Enter $0.' }
  if (feeCents > cap.totalCents) return { cap, problem: `The fee is above the statutory cap of ${usdCents(cap.totalCents)}.` }
  return { cap, problem: null }
}

// ─── the whole certificate ───────────────────────────────────────────

export interface Certificate {
  jurisdiction: Jurisdiction
  deadlines: Deadlines
  figures: Figures
  fields: CertificateField[]
}

export function buildCertificate(input: EstoppelInput, req: EstoppelRequest): Certificate {
  const j = jurisdictionOf(input.state)
  const d = deadlines(j, req)
  const figures = computeFigures(input, req.issueDate, d.effectiveThrough)
  return { jurisdiction: j, deadlines: d, figures, fields: fieldsFor(j, input, figures) }
}

/** Problems with the request the board entered, or null. */
export function requestProblem(req: { requestDate: string; issueDate: string }): string | null {
  if (!isIsoDay(req.requestDate)) return 'Enter the day the request was received.'
  if (req.requestDate > req.issueDate) return 'The request date can’t be after today.'
  return null
}

// ─── audit (ids and amounts only) ────────────────────────────────────

export function auditFigures(c: Certificate) {
  const f = c.figures
  return {
    jurisdiction: c.jurisdiction,
    balance_cents: f.currentBalanceCents,
    past_due_cents: f.pastDueCents,
    not_yet_due_cents: f.notYetDueCents,
    open_violation_ids: f.openViolations.map((v) => v.id),
    payment_plan_id: f.activePlan?.id ?? null,
    collection_case_id: f.collections?.caseId ?? null,
  }
}
