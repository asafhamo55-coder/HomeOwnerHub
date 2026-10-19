// Statute-aware collections letters for one home (BL-089), as data.
//
// Pure and client-safe. Built IN CODE from the ledger (lib/resident-ledger,
// through the estoppel certificate's charge lines) and the state rule in
// law.ts — no AI writes any of it. Money is integer cents throughout and
// nothing here reads a clock: the letter date is passed in, on the
// association's calendar.
//
// Any fact the app does not hold is a BLANK (a field with `value: null`),
// the estoppel certificate's pattern, reused: the board fills every BLANK
// before the letter can go to Approvals or be printed.

import { formatDay } from '@/lib/money/format'
import {
  blanksLeft,
  chargeLines,
  parseMoneyCents,
  usdCents,
  type CertificateField,
  type ChargeLine,
  type EstoppelInput,
  type FieldValues,
} from '@/lib/properties/estoppel/model'
import { addCalendarDays } from '@/lib/properties/estoppel/business-days'
import { buildLedger } from '@/lib/resident-ledger'
import { COLLECTION_STATUSES, statusImpliedBy, type CollectionEventType, type CollectionStatus } from '../statuses'
import {
  CA_CITATION,
  CA_DELINQUENT_AFTER_DAYS,
  CA_FINE_NOTE,
  CA_MAILING,
  CA_MAX_INTEREST_PERCENT,
  CA_PRE_LIEN_DAYS,
  FL_DEFAULT_INTEREST_PERCENT,
  FL_FINE_NOTE,
  FL_INTENT_CITATION,
  FL_INTENT_DAYS,
  FL_INTENT_MAILING,
  FL_LATE_NOTICE_CITATION,
  FL_LATE_NOTICE_DAYS,
  FL_LATE_NOTICE_MAILING,
  GENERIC_NOTE,
  TX_CITATION,
  TX_CURE_DAYS,
  TX_MAILING,
} from './law'

export { usdCents }

// ─── kinds ───────────────────────────────────────────────────────────

export type LetterJurisdiction = 'FL' | 'CA' | 'TX' | 'generic'

export function letterJurisdiction(state: string | null | undefined): LetterJurisdiction {
  const s = (state ?? '').trim().toUpperCase()
  return s === 'FL' || s === 'CA' || s === 'TX' ? s : 'generic'
}

export const LETTER_KINDS = ['past_due', 'fl_late_notice', 'fl_intent_to_lien', 'ca_pre_lien', 'tx_delinquency'] as const
export type LetterKind = (typeof LETTER_KINDS)[number]

export interface LetterMeta {
  /** Picker label. */
  label: string
  /** The heading printed on the letter. */
  title: string
  citation: string | null
  /** One line under the picker option. */
  description: string
  /** The collections event the print records. */
  eventType: CollectionEventType
  /** How it must be sent, shown on screen only. */
  mailing: string | null
  /** The state the letter belongs to; null = any state. */
  jurisdiction: LetterJurisdiction | null
  /** Fines are listed on the letter. */
  listsFines: boolean
}

export const LETTER_META: Record<LetterKind, LetterMeta> = {
  past_due: {
    label: 'Past-due letter',
    title: 'Past-Due Account Notice',
    citation: null,
    description: 'A plain reminder of what is past due. Makes no statutory claim.',
    eventType: 'collection_letter_sent',
    mailing: null,
    jurisdiction: null,
    listsFines: true,
  },
  fl_late_notice: {
    label: 'Notice of late assessment (30 days)',
    title: 'NOTICE OF LATE ASSESSMENT',
    citation: FL_LATE_NOTICE_CITATION,
    description: 'Required before the association can charge attorney fees on a past-due assessment. Gives the owner 30 days to pay.',
    eventType: 'lien_warning_sent',
    mailing: FL_LATE_NOTICE_MAILING,
    jurisdiction: 'FL',
    listsFines: false,
  },
  fl_intent_to_lien: {
    label: 'Notice of intent to record a claim of lien (45 days)',
    title: 'NOTICE OF INTENT TO RECORD A CLAIM OF LIEN',
    citation: FL_INTENT_CITATION,
    description: 'Required before a claim of lien is recorded. Gives the owner 45 days to pay.',
    eventType: 'lien_letter_sent',
    mailing: FL_INTENT_MAILING,
    jurisdiction: 'FL',
    listsFines: false,
  },
  ca_pre_lien: {
    label: 'Pre-lien notice (§ 5660)',
    title: 'Notice of Delinquent Assessment Before Recording a Lien',
    citation: CA_CITATION,
    description: 'Must be sent by certified mail at least 30 days before a lien is recorded.',
    eventType: 'lien_letter_sent',
    mailing: CA_MAILING,
    jurisdiction: 'CA',
    listsFines: false,
  },
  tx_delinquency: {
    label: 'Delinquency notice (§ 209.0064)',
    title: 'Notice of Delinquency',
    citation: TX_CITATION,
    description: 'Required before the owner can be charged a collection agent’s fees. Gives 45 days to cure.',
    eventType: 'collection_letter_sent',
    mailing: TX_MAILING,
    jurisdiction: 'TX',
    listsFines: true,
  },
}

/** The letters a state's association can draft, statutory ones first. */
export function kindsFor(j: LetterJurisdiction): LetterKind[] {
  const own = LETTER_KINDS.filter((k) => LETTER_META[k].jurisdiction === j)
  return [...own, 'past_due']
}

// ─── input ───────────────────────────────────────────────────────────

export type LetterInput = Pick<
  EstoppelInput,
  'state' | 'associationName' | 'propertyId' | 'address' | 'unitNumber' | 'unitId' | 'lotNumber' | 'owners' | 'charges' | 'payments' | 'plans' | 'timeZone'
>

/** A recorded collections event (collection_events), as the waiting rule reads it. */
export interface LetterEvent {
  eventType: CollectionEventType
  occurredOn: string
}

// ─── figures ─────────────────────────────────────────────────────────

const ASSESSMENT_TYPES = new Set(['regular', 'special', 'plan_installment'])
const cents = (n: number) => Math.round(Number(n) * 100)
const sum = (lines: ChargeLine[]) => lines.reduce((t, l) => t + l.remainingCents, 0)

export interface LetterFigures {
  letterDate: string
  /** Unpaid assessments (dues, specials, plan installments) on this letter. */
  assessmentLines: ChargeLine[]
  lateFeeLines: ChargeLine[]
  /** Fines and other charges listed (only on letters that list them). */
  otherLines: ChargeLine[]
  /** Past-due charges this letter leaves out (fines on a lien notice). */
  omittedLines: ChargeLine[]
  assessmentsCents: number
  lateFeesCents: number
  otherCents: number
  /** Payments and credits not applied to any charge: 0 or negative. */
  creditCents: number
  /** What the ledger says is owed on this letter: the lines plus the credit. */
  ledgerCents: number
}

/**
 * The past-due charges a letter lists. Past due = due before the letter
 * date and not fully paid. A California pre-lien notice lists only
 * assessments already DELINQUENT under § 5650(b), 15 days after the due
 * date; late fees are listed once past due.
 */
export function letterFigures(input: LetterInput, kind: LetterKind, letterDate: string): LetterFigures {
  const lines = chargeLines(input)
  const ledger = buildLedger(input.charges, input.payments, input.timeZone)
  const owedByToday = lines.filter((l) => l.dueDate <= letterDate && l.remainingCents > 0)
  const future = lines.filter((l) => l.dueDate > letterDate && l.remainingCents > 0)
  // The estoppel rule: balance less what isn't due yet, less what is owed
  // today, is money paid but not applied to a charge. Never a debit.
  const creditCents = Math.min(0, cents(ledger.totals.balance) - sum(future) - sum(owedByToday))

  const pastDue = owedByToday.filter((l) => l.dueDate < letterDate)
  const delinquent = (l: ChargeLine) => kind !== 'ca_pre_lien' || addCalendarDays(l.dueDate, CA_DELINQUENT_AFTER_DAYS) <= letterDate
  const assessmentLines = pastDue.filter((l) => ASSESSMENT_TYPES.has(l.type) && delinquent(l))
  const lateFeeLines = pastDue.filter((l) => l.type === 'late_fee')
  const rest = pastDue.filter((l) => !ASSESSMENT_TYPES.has(l.type) && l.type !== 'late_fee')
  const otherLines = LETTER_META[kind].listsFines ? rest : []
  const omittedLines = [...(LETTER_META[kind].listsFines ? [] : rest), ...pastDue.filter((l) => ASSESSMENT_TYPES.has(l.type) && !delinquent(l))]

  const assessmentsCents = sum(assessmentLines)
  const lateFeesCents = sum(lateFeeLines)
  const otherCents = sum(otherLines)
  return {
    letterDate,
    assessmentLines,
    lateFeeLines,
    otherLines,
    omittedLines,
    assessmentsCents,
    lateFeesCents,
    otherCents,
    creditCents,
    ledgerCents: assessmentsCents + lateFeesCents + otherCents + creditCents,
  }
}

/** "Jan 1, 2026 – Mar 1, 2026" for the "Maintenance due (dates)" line. */
export function dueDatesLabel(lines: ChargeLine[]): string {
  if (lines.length === 0) return '—'
  const days = lines.map((l) => l.dueDate).sort()
  const first = days[0]!
  const last = days[days.length - 1]!
  return first === last ? formatDay(first) : `${formatDay(first)} – ${formatDay(last)}`
}

// ─── waiting periods ─────────────────────────────────────────────────

export type Waiting =
  | { ok: true; note: string | null }
  /** `earliest`: the first day the letter can be drafted, when time alone fixes it. */
  | { ok: false; reason: string; earliest: string | null }

/**
 * Whether this letter may be drafted on this day. Refusals carry the
 * reason, shown to the board as is.
 */
export function waitingCheck(kind: LetterKind, f: LetterFigures, events: LetterEvent[], letterDate: string): Waiting {
  const owed = f.assessmentsCents + f.lateFeesCents + f.otherCents
  if (kind === 'ca_pre_lien' && f.assessmentsCents === 0) {
    const pending = f.omittedLines.filter((l) => ASSESSMENT_TYPES.has(l.type)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    if (pending) {
      const on = addCalendarDays(pending.dueDate, CA_DELINQUENT_AFTER_DAYS)
      return {
        ok: false,
        reason: `No assessment is delinquent yet. Under § 5650(b) an assessment becomes delinquent 15 days after it is due: the oldest unpaid one, due ${formatDay(pending.dueDate)}, is delinquent on ${formatDay(on)}.`,
        earliest: on,
      }
    }
    return { ok: false, reason: 'No assessment is past due on this account, so there is no debt to notice under § 5660.', earliest: null }
  }
  if (kind === 'fl_late_notice' && f.assessmentsCents === 0) {
    return { ok: false, reason: 'No assessment is past due on this account. A notice of late assessment is for a past-due assessment (§ 720.3085(3)(d)).', earliest: null }
  }
  if (owed === 0) return { ok: false, reason: 'Nothing is past due on this account.', earliest: null }
  if (f.ledgerCents <= 0) {
    return { ok: false, reason: `Payments and credits on the account (${usdCents(-f.creditCents)}) cover everything past due.`, earliest: null }
  }

  if (kind === 'fl_intent_to_lien') {
    const notices = events
      .filter((e) => e.eventType === 'lien_warning_sent' && e.occurredOn <= letterDate)
      .map((e) => e.occurredOn)
      .sort()
    if (notices.length === 0) {
      return {
        ok: false,
        reason:
          'No notice of late assessment is recorded on this case. Print or record that notice first: Florida bars attorney fees on a past-due assessment until it is delivered (§ 720.3085(3)(d)), and it tells the owner further collection action comes no sooner than 30 days after its date.',
        earliest: null,
      }
    }
    const ready = notices.filter((d) => addCalendarDays(d, FL_LATE_NOTICE_DAYS) <= letterDate)
    if (ready.length === 0) {
      const latest = notices[notices.length - 1]!
      const earliest = addCalendarDays(latest, FL_LATE_NOTICE_DAYS)
      return {
        ok: false,
        reason: `The notice of late assessment was recorded on ${formatDay(latest)}. It promised the owner no further collection action sooner than 30 days after its date, so the intent-to-lien letter can be drafted on or after ${formatDay(earliest)}.`,
        earliest,
      }
    }
    return { ok: true, note: `Notice of late assessment recorded on ${formatDay(ready[ready.length - 1]!)}, at least 30 days ago.` }
  }
  if (kind === 'ca_pre_lien') {
    return { ok: true, note: `A lien may be recorded no sooner than 30 days after this notice is mailed (${formatDay(addCalendarDays(letterDate, CA_PRE_LIEN_DAYS))} if mailed on the letter date).` }
  }
  return { ok: true, note: null }
}

/** A day the letter itself states or implies, computed from the letter date. */
export interface LetterDeadline {
  label: string
  day: string
}

export function letterDeadline(kind: LetterKind, letterDate: string): LetterDeadline | null {
  switch (kind) {
    case 'fl_late_notice':
      return { label: '30 days after the date of this letter', day: addCalendarDays(letterDate, FL_LATE_NOTICE_DAYS) }
    case 'fl_intent_to_lien':
      return { label: 'Earliest day to record a claim of lien, if mailed on the letter date (45 days)', day: addCalendarDays(letterDate, FL_INTENT_DAYS) }
    case 'ca_pre_lien':
      return { label: 'Earliest day to record a lien, if mailed on the letter date (30 days)', day: addCalendarDays(letterDate, CA_PRE_LIEN_DAYS) }
    case 'tx_delinquency':
      return { label: 'Cure period ends (45 days)', day: addCalendarDays(letterDate, TX_CURE_DAYS) }
    case 'past_due':
      return null
  }
}

// ─── fields and BLANKs ───────────────────────────────────────────────

/** Money BLANKs added to the ledger amount, in the order printed. */
export const ENTERED_MONEY: Record<LetterKind, string[]> = {
  past_due: [],
  fl_late_notice: ['interest'],
  fl_intent_to_lien: ['interest', 'certifiedMail', 'otherCosts'],
  ca_pre_lien: ['collectionCosts', 'attorneyFees', 'interest'],
  tx_delinquency: [],
}

export function letterFields(kind: LetterKind, input: LetterInput): CertificateField[] {
  const owners = input.owners.map((o) => o.trim()).filter(Boolean)
  const fields: CertificateField[] = [
    { key: 'associationName', label: 'Association name', kind: 'text', value: input.associationName?.trim() || null },
    { key: 'owners', label: 'Owner(s) of record', kind: 'text', value: owners.length > 0 ? owners.join('; ') : null },
    {
      key: 'mailingAddress',
      label: 'Owner’s mailing address',
      kind: 'textarea',
      value: null,
      hint: 'The owner’s last address in the association’s records. If the owner lives at the home, write the home’s address.',
    },
  ]
  if (kind === 'fl_late_notice' || kind === 'fl_intent_to_lien') {
    fields.push(
      { key: 'parcel', label: 'Parcel (lot/block or parcel number)', kind: 'text', value: input.lotNumber?.trim() ? `Lot ${input.lotNumber.trim()}` : null, hint: 'From the plat or the county property appraiser.' },
      { key: 'interest', label: 'Interest owed', kind: 'money', value: null, hint: 'Enter 0 if the association charges none.' },
      { key: 'interestThrough', label: 'Interest calculated through (dates)', kind: 'text', value: null, hint: 'The period the interest covers, e.g. “Sep 1 – Oct 19, 2026”, or “None”.' },
      { key: 'interestRate', label: 'Interest rate (percent per year)', kind: 'text', value: null, hint: `The rate in your declaration or bylaws; ${FL_DEFAULT_INTEREST_PERCENT} if they set none (§ 720.3085(3)). Enter 0 if none is charged.` },
    )
  }
  if (kind === 'fl_intent_to_lien') {
    fields.push(
      { key: 'certifiedMail', label: 'Certified mail charges', kind: 'money', value: null, hint: 'Enter 0 if none.' },
      { key: 'otherCosts', label: 'Other costs', kind: 'money', value: null, hint: 'Attorney’s fees and the actual costs of preparing and delivering this notice (§ 720.3085(4)(a)). Enter 0 if none.' },
    )
  }
  if (kind === 'ca_pre_lien') {
    fields.push(
      {
        key: 'procedures',
        label: 'Collection and lien enforcement procedures, and how the amount is calculated',
        kind: 'textarea',
        value: null,
        hint: 'A general description, usually from the association’s annual collection policy (§ 5660(a)).',
      },
      { key: 'collectionCosts', label: 'Fees and reasonable costs of collection', kind: 'money', value: null, hint: 'Enter 0 if none.' },
      { key: 'attorneyFees', label: 'Reasonable attorney’s fees', kind: 'money', value: null, hint: 'Enter 0 if none.' },
      { key: 'interest', label: 'Interest owed', kind: 'money', value: null, hint: 'Interest starts 30 days after the due date (§ 5650(b)(3)). Enter 0 if none.' },
      { key: 'interestRate', label: 'Interest rate (percent per year)', kind: 'text', value: null, hint: `At most ${CA_MAX_INTEREST_PERCENT} (§ 5650(b)(3)), or the lower rate in your declaration. Enter 0 if none is charged.` },
    )
  }
  if (kind === 'tx_delinquency') {
    fields.push({
      key: 'paymentPlan',
      label: 'Options to avoid collection, including any payment plan',
      kind: 'textarea',
      value: null,
      hint: 'Required if the association is subject to § 209.0062 or its dedicatory instruments require a payment plan offer (§ 209.0064(b)(2)). Otherwise write “Not applicable”.',
    })
  }
  if (kind === 'past_due') {
    fields.push({ key: 'payBy', label: 'Please pay by', kind: 'text', value: null, hint: 'The date you ask the owner to pay by.' })
  }
  fields.push({ key: 'signer', label: 'Signed by (name and title)', kind: 'text', value: null, hint: 'A board member, officer or the association’s manager.' })
  return fields
}

/** "18", "18%", "12.5" → 18, 18, 12.5; anything else null. */
export function parsePercent(s: string | undefined): number | null {
  const t = (s ?? '').replace(/\s|%/g, '')
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null
  return Number(t)
}

/** Entries the board made that can't be printed as entered (beyond an empty BLANK). */
export function letterProblems(kind: LetterKind, values: FieldValues): string[] {
  const out: string[] = []
  if (kind === 'fl_late_notice' || kind === 'fl_intent_to_lien' || kind === 'ca_pre_lien') {
    const raw = (values.interestRate ?? '').trim()
    const rate = parsePercent(raw)
    if (raw && rate === null) out.push('Enter the interest rate as a number, like 18 or 12.5.')
    if (kind === 'ca_pre_lien' && rate !== null && rate > CA_MAX_INTEREST_PERCENT) {
      out.push(`The interest rate can’t be above ${CA_MAX_INTEREST_PERCENT}% a year (§ 5650(b)(3)).`)
    }
  }
  return out
}

// ─── totals ──────────────────────────────────────────────────────────

export interface LetterTotals {
  ledgerCents: number
  /** Each money BLANK, with its cents once filled. */
  entered: { key: string; label: string; cents: number | null }[]
  /** Null until every money BLANK is filled. */
  enteredCents: number | null
  totalCents: number | null
}

export function letterTotals(letter: Letter, values: FieldValues): LetterTotals {
  const entered = ENTERED_MONEY[letter.kind].map((key) => {
    const field = letter.fields.find((f) => f.key === key)!
    return { key, label: field.label, cents: parseMoneyCents(values[key] ?? '') }
  })
  const enteredCents = entered.every((e) => e.cents !== null) ? entered.reduce((t, e) => t + e.cents!, 0) : null
  return {
    ledgerCents: letter.figures.ledgerCents,
    entered,
    enteredCents,
    totalCents: enteredCents === null ? null : letter.figures.ledgerCents + enteredCents,
  }
}

// ─── the whole letter ────────────────────────────────────────────────

export interface Letter {
  kind: LetterKind
  jurisdiction: LetterJurisdiction
  meta: LetterMeta
  letterDate: string
  figures: LetterFigures
  fields: CertificateField[]
  waiting: Waiting
  deadline: LetterDeadline | null
  /** Shown on screen under the figures: what was left out and why. */
  notes: string[]
}

export function buildLetter(input: LetterInput, kind: LetterKind, letterDate: string, events: LetterEvent[]): Letter {
  const jurisdiction = letterJurisdiction(input.state)
  const meta = LETTER_META[kind]
  const figures = letterFigures(input, kind, letterDate)
  const allowed = kindsFor(jurisdiction).includes(kind)
  const waiting: Waiting = allowed
    ? waitingCheck(kind, figures, events, letterDate)
    : { ok: false, reason: `This letter is for ${meta.jurisdiction} associations, and this home’s association is not in ${meta.jurisdiction}.`, earliest: null }
  const notes: string[] = []
  if (figures.omittedLines.some((l) => !ASSESSMENT_TYPES.has(l.type))) {
    notes.push(kind === 'ca_pre_lien' ? CA_FINE_NOTE : FL_FINE_NOTE)
  }
  if (kind === 'ca_pre_lien' && figures.omittedLines.some((l) => ASSESSMENT_TYPES.has(l.type))) {
    notes.push('Assessments less than 15 days past due are not delinquent yet (§ 5650(b)) and are left off.')
  }
  if (kind === 'past_due') notes.push(GENERIC_NOTE)
  return {
    kind,
    jurisdiction,
    meta,
    letterDate,
    figures,
    fields: letterFields(kind, input),
    waiting,
    deadline: letterDeadline(kind, letterDate),
    notes,
  }
}

/** Every BLANK still unfilled; nothing is saved or printed until this is empty. */
export function letterBlanks(letter: Letter, values: FieldValues): string[] {
  return blanksLeft(letter.fields, values)
}

/**
 * Why the letter can't go to Approvals (or be printed) yet, or null. The
 * order is the order the board would fix things in.
 */
export function letterBlocked(letter: Letter, values: FieldValues, verified: boolean): string | null {
  if (!letter.waiting.ok) return letter.waiting.reason
  const blanks = letterBlanks(letter, values)
  if (blanks.length > 0) return 'Fill in every BLANK first.'
  const problems = letterProblems(letter.kind, values)
  if (problems.length > 0) return problems[0]!
  if ((letterTotals(letter, values).totalCents ?? 0) <= 0) return 'The total owed is not above zero.'
  if (!verified) return 'Tick “I’ve verified these figures” first.'
  return null
}

/** Only the board's entries for this letter's BLANKs, trimmed: what Approvals stores. */
export function blankValues(letter: Letter, values: FieldValues): FieldValues {
  const out: FieldValues = {}
  for (const f of letter.fields) {
    if (f.value !== null) continue
    const v = (values[f.key] ?? '').trim()
    if (v) out[f.key] = v
  }
  return out
}

/** The charge ids the letter's figures come from, sorted: a change means the account moved. */
export function letterChargeIds(letter: Letter): string[] {
  const f = letter.figures
  return [...f.assessmentLines, ...f.lateFeeLines, ...f.otherLines].map((l) => l.id).sort()
}

// ─── the case's stage after printing ─────────────────────────────────

/**
 * The stage the case moves to when the letter is printed, or null to stay.
 * Only forward: printing a past-due letter never pulls a case back from
 * the attorney.
 */
export function stageAfterPrint(kind: LetterKind, current: CollectionStatus): CollectionStatus | null {
  const implied = statusImpliedBy(LETTER_META[kind].eventType)
  if (!implied) return null
  return COLLECTION_STATUSES.indexOf(implied) > COLLECTION_STATUSES.indexOf(current) ? implied : null
}
