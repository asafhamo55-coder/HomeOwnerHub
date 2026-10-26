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
  GA_CONDO_RESPONSE_BUSINESS_DAYS,
  GA_RESPONSE_BUSINESS_DAYS,
  gaCondoFeeCap,
  gaFeeCap,
  TX_RESPONSE_BUSINESS_DAYS,
  txFeeCap,
  type FeeCap,
  type FlDelivery,
} from './law'
import { isGaCondo } from '@/lib/ga-condo/law'

// ─── input ───────────────────────────────────────────────────────────

export type Jurisdiction = 'FL' | 'CA' | 'TX' | 'GA' | 'generic'

export function jurisdictionOf(state: string | null | undefined): Jurisdiction {
  const s = (state ?? '').trim().toUpperCase()
  return s === 'FL' || s === 'CA' || s === 'TX' || s === 'GA' ? s : 'generic'
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
  /**
   * The charges that are a payment plan's installments, by the stored
   * plan → charge link (the installment's journal entry memo, BL-080;
   * load.ts reads it with loadInstallments). Never rebuilt from the
   * plan's start date: lib/payment-plans.ts overflows month ends
   * (Jan 31 + 1 month = Mar 3), so a rebuilt schedule mislabels them.
   */
  planInstallmentIds: string[]
  collectionCase: EstoppelCase | null
  timeZone: string
  /**
   * BL-155: associations.type ('hoa' | 'condo' | 'coop'). A Georgia
   * 'condo' gets the Condominium Act's § 44-3-109(d) statement instead of
   * the POA Act's § 44-3-232(d). Absent or anything else: unchanged.
   */
  associationType?: string | null
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
export function chargeLines(input: Pick<EstoppelInput, 'charges' | 'payments' | 'planInstallmentIds'>): ChargeLine[] {
  const paid = new Map<string, number>()
  for (const p of input.payments) {
    if (p.assessment_id) paid.set(p.assessment_id, (paid.get(p.assessment_id) ?? 0) + cents(p.amount))
  }
  const installments = new Set(input.planInstallmentIds)
  return input.charges
    .map((c) => {
      const amountCents = cents(c.amount)
      const remainingCents = CLOSED.has(c.status) ? 0 : Math.max(0, amountCents - (paid.get(c.id) ?? 0))
      const isInstallment = installments.has(c.id)
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
  /** FL, TX: 10 business days after the request. CA: 10 days. GA: 5 business days. Generic: null. */
  responseDue: string | null
  responseRule: string | null
  /** Federal holidays skipped in counting a business-day deadline (FL, TX, GA). */
  holidaysSkipped: Holiday[]
  /** FL: the day an expedited certificate must be delivered by. */
  expeditedDue: string | null
  /** FL § 720.30851(2): 30 or 35 days. */
  effectiveDays: number | null
  effectiveThrough: string | null
  /** Issued after the response deadline (FL, TX: no fee may be charged; GA: the lien is extinguished as to the buyer or lender). */
  late: boolean
  /** Asked for expedited but issued after 3 business days: no expedited fee. */
  expeditedMissed: boolean
}

/** `condo`: a Georgia condominium association (§ 44-3-109(d) instead of § 44-3-232(d)). */
export function deadlines(j: Jurisdiction, req: EstoppelRequest, condo = false): Deadlines {
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
  if (j === 'TX' || j === 'GA') {
    const gaCondo = j === 'GA' && condo
    const days = j === 'TX' ? TX_RESPONSE_BUSINESS_DAYS : gaCondo ? GA_CONDO_RESPONSE_BUSINESS_DAYS : GA_RESPONSE_BUSINESS_DAYS
    const responseDue = addBusinessDays(requestDate, days)
    return {
      requestDate,
      issueDate,
      responseDue,
      responseRule:
        j === 'TX'
          ? `${days} business days after the written request is received and verified (§ 207.003(a))`
          : gaCondo
            ? `${days} business days from the receipt of the written request (§ 44-3-109(d))`
            : `${days} business days from the receipt of the written request (§ 44-3-232(d))`,
      holidaysSkipped: holidaysBetween(requestDate, responseDue),
      expeditedDue: null,
      effectiveDays: null,
      effectiveThrough: null,
      late: issueDate > responseDue,
      expeditedMissed: false,
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
  /**
   * Charges due before the issue day that are still unpaid, less any
   * payment or credit not applied to a charge (never below 0): money the
   * owner has paid is not owed, linked to a charge or not.
   */
  pastDueCents: number
  /** A past-due amount is actually owed (FL: the $150 fee add-on applies). */
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
  const rawPastDueCents = lines.filter((l) => l.dueDate < issueDate && l.remainingCents > 0).reduce((t, l) => t + l.remainingCents, 0)
  const unappliedCents = currentBalanceCents - owedCents
  const pastDueCents = Math.max(0, rawPastDueCents + Math.min(0, unappliedCents))

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
    unappliedCents,
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

// ─── violations: what each statute asks ──────────────────────────────

export type OpenViolation = Figures['openViolations'][number]

export interface ViolationDisclosure {
  /** The certificate's line label (the statute's own question where it has one). */
  label: string
  /** The violations the certificate's answer covers (and counts). */
  listed: OpenViolation[]
  /**
   * Open violations the statutory question does not cover: shown to the
   * board on screen to check the records, never printed and never counted
   * in the answer.
   */
  boardCheck: OpenViolation[]
  boardCheckLabel: string | null
  boardCheckHint: string | null
}

/**
 * Which open violations go on the certificate, per state:
 *
 * - FL § 720.30851(1)(h), item 7: "Is there any open violation of rule or
 *   regulation noticed to the parcel owner in the association official
 *   records? (Yes) (No)". Only violations with a recorded notice answer
 *   it. An open violation without one is outside the question — the
 *   statute does not ask for it, and the certificate binds the association
 *   to what it states — so it is shown to the board to verify (record the
 *   notice if one was given outside the app), not printed.
 * - CA § 4525(a)(5): "a copy or a summary of any notice previously sent to
 *   the owner pursuant to Section 5855 that sets forth any alleged
 *   violation … that remains unresolved". Notices only, same split.
 * - TX § 207.003(b)(11): "any conditions on the owner's property that the
 *   … board has actual knowledge are in violation" — knowledge, not
 *   notice, so every open violation on record is listed.
 * - GA § 44-3-232(d) (§ 44-3-109(d) for a condominium) asks only for
 *   amounts due, and the generic statement
 *   follows no statute: every open violation on record is listed, as the
 *   records show it.
 */
export function violationDisclosure(j: Jurisdiction, f: Pick<Figures, 'openViolations'>): ViolationDisclosure {
  const all = f.openViolations
  if (j === 'FL' || j === 'CA') {
    const listed = all.filter((v) => v.noticed)
    return {
      label:
        j === 'FL'
          ? 'Is there any open violation of rule or regulation noticed to the parcel owner in the association official records?'
          : 'Unresolved violation notices sent to the owner (§ 4525(a)(5))',
      listed,
      boardCheck: all.filter((v) => !v.noticed),
      boardCheckLabel: 'Open violations not yet noticed to the owner (board to verify)',
      boardCheckHint:
        j === 'FL'
          ? 'Not on the certificate: item 7 of § 720.30851(1)(h) asks only about violations noticed to the owner in the official records. If a notice was given, record it on the violation before issuing.'
          : 'Not on the statement: § 4525(a)(5) covers only notices previously sent to the owner under § 5855. If a notice was sent, record it on the violation before issuing.',
    }
  }
  return {
    label: j === 'TX' ? 'Open violations on record (§ 207.003(b)(11))' : 'Open violations',
    listed: all,
    boardCheck: [],
    boardCheckLabel: null,
    boardCheckHint: null,
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
  if (j === 'TX') {
    // § 207.003(b)(13) and (16) ask for every transfer fee in detail;
    // the generic yes/no transfer-fee line would only repeat them.
    const i = fields.findIndex((x) => x.key === 'transferFee')
    if (i >= 0) fields.splice(i, 1)
    const signer = fields.find((x) => x.key === 'signer')
    if (signer) signer.hint = 'An officer or authorized agent of the association, who signs and dates it (§ 207.001(5)).'
    fields.push(
      { key: 'firstRefusal', label: 'Right of first refusal or other restraint on transfer in the restrictions', kind: 'yesno_detail', value: null, hint: '§ 207.003(b)(1). If yes, state it.' },
      {
        key: 'approvedSpecials',
        label: 'Special assessments approved before, and due after, delivery: amount and purpose',
        kind: 'textarea',
        value: null,
        hint: '§ 207.003(b)(3). The certificate lists special assessments already billed; add any approved but not billed yet. Write “None” if there are none.',
      },
      { key: 'capitalExpenditures', label: 'Capital expenditures approved for the current fiscal year', kind: 'textarea', value: null, hint: '§ 207.003(b)(5). Write “None” if there are none.' },
      { key: 'reserves', label: 'Amount of reserves for capital expenditures', kind: 'text', value: null, hint: '§ 207.003(b)(6). Write “None” if there are none.' },
      { key: 'judgments', label: 'Total of unsatisfied judgments against the association', kind: 'text', value: null, hint: '§ 207.003(b)(8). Write “None” if there are none.' },
      {
        key: 'lawsuits',
        label: 'Pending lawsuits the association is a party to: style and cause number',
        kind: 'textarea',
        value: null,
        hint: '§ 207.003(b)(9). Leave out suits over one member’s unpaid property taxes. Write “None” if there are none.',
      },
      {
        key: 'knownViolations',
        label: 'Other conditions on the property the board knows violate the restrictions, bylaws or rules',
        kind: 'textarea',
        value: null,
        hint: '§ 207.003(b)(11). The open violations on record are listed on the certificate; add anything else the board actually knows of. Write “None” if there is nothing else.',
      },
      {
        key: 'governmentNotices',
        label: 'Notices from a government authority about health or housing code violations on the property or common areas',
        kind: 'textarea',
        value: null,
        hint: '§ 207.003(b)(12). A summary, or attach copies. Write “None” if there are none.',
      },
      { key: 'adminTransferFee', label: 'Administrative transfer fee charged for a change of ownership', kind: 'text', value: null, hint: '§ 207.003(b)(13). Write “None” if there is none.' },
      {
        key: 'managingAgent',
        label: 'Managing agent’s name, mailing address and telephone number',
        kind: 'textarea',
        value: null,
        hint: '§ 207.003(b)(14). Write “None” if there is no managing agent.',
      },
      { key: 'foreclosure', label: 'Do the restrictions allow foreclosure of the association’s lien for failure to pay assessments?', kind: 'yesno', value: null, hint: '§ 207.003(b)(15).' },
      {
        key: 'transferFees',
        label: 'All fees associated with the transfer of ownership: what each is for, who it is paid to, and the amount',
        kind: 'textarea',
        value: null,
        hint: '§ 207.003(b)(16). Write “None” if there are none.',
      },
    )
  }
  if (j === 'GA' && isGaCondo(input.state, input.associationType)) {
    fields.push(
      {
        key: 'condoAct',
        label: 'Is the condominium submitted to the Georgia Condominium Act?',
        kind: 'yesno',
        value: null,
        hint: 'Your recorded declaration submits the property to the Act (§ 44-3-71(7)). § 44-3-109(d) applies only then.',
      },
      {
        key: 'instrumentFee',
        label: 'Do the condominium instruments provide for a fee for this statement?',
        kind: 'yesno',
        value: null,
        hint: 'Georgia allows a fee of up to $10.00 only if the condominium instruments provide for it (§ 44-3-109(d)).',
      },
    )
  } else if (j === 'GA') {
    fields.push(
      {
        key: 'poaAct',
        label: 'Is the association submitted to the Georgia Property Owners’ Association Act?',
        kind: 'yesno',
        value: null,
        hint: 'Your declaration, or an amendment to it, submits the community to the Act (§ 44-3-235(a)). § 44-3-232(d) applies only then.',
      },
      {
        key: 'instrumentFee',
        label: 'Does the declaration provide for a fee for this statement?',
        kind: 'yesno',
        value: null,
        hint: 'Georgia allows a fee of up to $10.00 only if the declaration provides for it (§ 44-3-232(d)).',
      },
    )
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

/** The board's answers that decide whether a statute applies or a fee is allowed (GA only today). */
export interface StatuteAnswers {
  /** GA: the association is submitted to the POA Act. */
  poaAct?: boolean | null
  /** GA condominium (BL-155): the property is submitted to the Condominium Act. */
  condoAct?: boolean | null
  /** GA: the declaration provides for a statement fee. */
  feeAuthorized?: boolean | null
}

const yesNo = (v: string | undefined): boolean | null => (v === 'Yes' ? true : v === 'No' ? false : null)

/** The StatuteAnswers in the board's BLANK entries. */
export function statuteAnswers(j: Jurisdiction, values: FieldValues, condo = false): StatuteAnswers {
  if (j !== 'GA') return {}
  if (condo) return { condoAct: yesNo(values.condoAct?.trim()), feeAuthorized: yesNo(values.instrumentFee?.trim()) }
  return { poaAct: yesNo(values.poaAct?.trim()), feeAuthorized: yesNo(values.instrumentFee?.trim()) }
}

/**
 * A reason the statutory statement can't be issued as worded, or null.
 * GA: § 44-3-232(d) is part of the POA Act, so a "No" to the Act stops
 * the print rather than issue a statement citing a statute that doesn't
 * apply. An unanswered question is a BLANK, handled by blanksLeft.
 */
export function statuteProblem(j: Jurisdiction, a: StatuteAnswers, condo = false): string | null {
  if (j === 'GA' && condo) {
    return a.condoAct === false
      ? '§ 44-3-109(d) applies only to condominiums submitted to the Georgia Condominium Act. Ask your association’s attorney what statement to give instead.'
      : null
  }
  if (j === 'GA' && a.poaAct === false) {
    return '§ 44-3-232(d) applies only to associations submitted to the Georgia Property Owners’ Association Act. Ask your association’s attorney what statement to give instead.'
  }
  return null
}

export function checkFee(
  j: Jurisdiction,
  d: Deadlines,
  f: Figures,
  req: EstoppelRequest,
  feeCents: number | null,
  answers: StatuteAnswers = {},
  condo = false,
): FeeCheck {
  if (j === 'GA' && condo) {
    const cap = gaCondoFeeCap()
    if (feeCents === null) return { cap, problem: null }
    if (feeCents > cap.totalCents) return { cap, problem: `The fee is above the statutory cap of ${usdCents(cap.totalCents)} (§ 44-3-109(d)).` }
    if (feeCents > 0 && answers.feeAuthorized !== true) {
      return { cap, problem: 'Georgia allows a fee only if the condominium instruments provide for one (§ 44-3-109(d)). Enter $0, or answer Yes if they do.' }
    }
    return { cap, problem: null }
  }
  if (j === 'TX') {
    const cap = txFeeCap()
    if (feeCents === null) return { cap, problem: null }
    if (d.late && feeCents > 0) return { cap, problem: 'This certificate is issued after the 10-business-day deadline, so no fee may be charged (§ 207.003(c-1)). Enter $0.' }
    if (feeCents > cap.totalCents) return { cap, problem: `The fee is above the statutory cap of ${usdCents(cap.totalCents)}.` }
    return { cap, problem: null }
  }
  if (j === 'GA') {
    const cap = gaFeeCap()
    if (feeCents === null) return { cap, problem: null }
    if (feeCents > cap.totalCents) return { cap, problem: `The fee is above the statutory cap of ${usdCents(cap.totalCents)} (§ 44-3-232(d)).` }
    if (feeCents > 0 && answers.feeAuthorized !== true) {
      return { cap, problem: 'Georgia allows a fee only if the declaration provides for one (§ 44-3-232(d)). Enter $0, or answer Yes if it does.' }
    }
    return { cap, problem: null }
  }
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
  /** BL-155: a Georgia condominium association (§ 44-3-109(d)); false everywhere else. */
  gaCondo: boolean
  deadlines: Deadlines
  figures: Figures
  fields: CertificateField[]
}

export function buildCertificate(input: EstoppelInput, req: EstoppelRequest): Certificate {
  const j = jurisdictionOf(input.state)
  const gaCondo = j === 'GA' && isGaCondo(input.state, input.associationType)
  const d = deadlines(j, req, gaCondo)
  // GA § 44-3-232(d) (and § 44-3-109(d) for a condominium): the statement
  // covers amounts due at the end of the five-business-day period, so
  // charges falling due by then are marked.
  const figures = computeFigures(input, req.issueDate, d.effectiveThrough ?? (j === 'GA' ? d.responseDue : null))
  return { jurisdiction: j, gaCondo, deadlines: d, figures, fields: fieldsFor(j, input, figures) }
}

/** Problems with the request the board entered, or null. */
export function requestProblem(req: { requestDate: string; issueDate: string }): string | null {
  if (!isIsoDay(req.requestDate)) return 'Enter the day the request was received.'
  if (req.requestDate > req.issueDate) return 'The request date can’t be after today.'
  return null
}

// ─── print snapshot ──────────────────────────────────────────────────

/**
 * The figures the browser shows, sent with "Print / Save as PDF". The
 * server rebuilds the certificate from the database and refuses unless
 * they match, so the page that prints is the certificate that was
 * recorded — never a snapshot from before a payment or a new charge.
 */
export interface PrintSnapshot {
  issueDate: string
  balance_cents: number
  not_yet_due_cents: number
  /** Every charge on the certificate (owed today and not yet due), sorted. */
  charge_ids: string[]
}

export const FIGURES_CHANGED = 'Figures changed since this page loaded — reload'

export function certificateChargeIds(c: Certificate): string[] {
  return [...c.figures.owedItems, ...c.figures.notYetDue].map((l) => l.id).sort()
}

export function printSnapshot(c: Certificate): PrintSnapshot {
  return {
    issueDate: c.deadlines.issueDate,
    balance_cents: c.figures.currentBalanceCents,
    not_yet_due_cents: c.figures.notYetDueCents,
    charge_ids: certificateChargeIds(c),
  }
}

export function snapshotMatches(c: Certificate, s: PrintSnapshot): boolean {
  const now = printSnapshot(c)
  return (
    now.issueDate === s.issueDate &&
    now.balance_cents === s.balance_cents &&
    now.not_yet_due_cents === s.not_yet_due_cents &&
    now.charge_ids.join(',') === [...s.charge_ids].sort().join(',')
  )
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
