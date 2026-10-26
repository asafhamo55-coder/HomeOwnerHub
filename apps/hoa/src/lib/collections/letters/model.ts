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
import { dayOf } from '@/lib/association-time'
import { checkCollectionsLetter, type DriftCheck, type GaRegistrationStatusOnly, type PrintedLetter } from '@/lib/compliance/statute-drift'
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
  GA_2027_FINE_NOTE,
  GA_232C_REPLACED_ON,
  GA_ATTORNEY_FEES_NOTE,
  GA_CONDO_PRE_FORECLOSURE_CITATION,
  GA_CONDO_PRE_FORECLOSURE_MAILING,
  GA_FEE_NOTICE_CITATION,
  GA_FEE_NOTICE_DAYS,
  GA_FEE_NOTICE_MAILING,
  GA_FORECLOSURE_MIN_CENTS,
  GA_LAPSE_WARN_DAYS,
  GA_LIEN_LAPSE_YEARS,
  GA_MAX_INTEREST_PERCENT,
  GA_PRE_FORECLOSURE_CITATION,
  GA_PRE_FORECLOSURE_MAILING,
  GENERIC_NOTE,
  gaForeclosureLaw,
  gaForeclosureThresholdCents,
  TX_CITATION,
  TX_CURE_DAYS,
  TX_MAILING,
} from './law'
import { LATE_FEE_LAWS, statutoryCapCents } from '../../late-fees/law'
import { GA_CONDO_FORECLOSURE_MIN_CENTS, GA_CONDO_LATE_CHARGE, GA_CONDO_NOTICE_DAYS, isGaCondo } from '../../ga-condo/law'

export { usdCents }

// ─── kinds ───────────────────────────────────────────────────────────

export type LetterJurisdiction = 'FL' | 'CA' | 'TX' | 'GA' | 'generic'

export function letterJurisdiction(state: string | null | undefined): LetterJurisdiction {
  const s = (state ?? '').trim().toUpperCase()
  return s === 'FL' || s === 'CA' || s === 'TX' || s === 'GA' ? s : 'generic'
}

export const LETTER_KINDS = [
  'past_due',
  'fl_late_notice',
  'fl_intent_to_lien',
  'ca_pre_lien',
  'tx_delinquency',
  'ga_fee_notice',
  'ga_pre_foreclosure',
  // BL-155: a Georgia condominium's notice before foreclosure (§ 44-3-109(c)).
  'ga_condo_pre_foreclosure',
] as const
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
  /**
   * The case stage printing moves to, when it differs from the one the
   * event implies (statusImpliedBy). The GA fee notice records a
   * "demand letter" but is the association's own first certified notice,
   * not the attorney's: it moves the case to "Collection letter sent" at
   * most, never to "With attorney".
   */
  stage?: CollectionStatus
  /**
   * BL-155, Georgia only: which Act the letter rests on. 'poa' letters are
   * offered to a Georgia HOA (or co-op, or untyped association); 'condo'
   * letters to a Georgia association whose type is 'condo'.
   */
  gaAct?: 'poa' | 'condo'
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
  ga_fee_notice: {
    label: 'Notice before attorney’s fees (SB 406, 30 days)',
    title: 'NOTICE OF OUTSTANDING FINES AND DELINQUENT FEES',
    citation: GA_FEE_NOTICE_CITATION,
    description: 'Required before the association can collect or be awarded attorney’s fees. Gives the owner 30 days from receipt to pay.',
    eventType: 'demand_letter_sent',
    mailing: GA_FEE_NOTICE_MAILING,
    jurisdiction: 'GA',
    listsFines: true,
    stage: 'collection_letter',
    gaAct: 'poa',
  },
  ga_pre_foreclosure: {
    label: 'Notice before foreclosure (§ 44-3-232(c), 30 days)',
    title: 'NOTICE OF AMOUNTS DUE BEFORE FORECLOSURE OF LIEN',
    citation: GA_PRE_FORECLOSURE_CITATION,
    description: 'Required at least 30 days before the association’s lien is foreclosed. Only for a lien of at least $2,000.',
    eventType: 'lien_letter_sent',
    mailing: GA_PRE_FORECLOSURE_MAILING,
    jurisdiction: 'GA',
    listsFines: true,
    gaAct: 'poa',
  },
  ga_condo_pre_foreclosure: {
    label: 'Notice before foreclosure (§ 44-3-109(c), 30 days)',
    title: 'NOTICE OF AMOUNTS DUE BEFORE FORECLOSURE OF LIEN',
    citation: GA_CONDO_PRE_FORECLOSURE_CITATION,
    description: 'Required at least 30 days before the condominium association’s lien is foreclosed. Only for a lien of at least $2,000.',
    eventType: 'lien_letter_sent',
    mailing: GA_CONDO_PRE_FORECLOSURE_MAILING,
    jurisdiction: 'GA',
    listsFines: true,
    gaAct: 'condo',
  },
}

/** The notice before foreclosure, under either Georgia Act. */
export function isGaForeclosureKind(kind: LetterKind): kind is 'ga_pre_foreclosure' | 'ga_condo_pre_foreclosure' {
  return kind === 'ga_pre_foreclosure' || kind === 'ga_condo_pre_foreclosure'
}

/**
 * BL-154: the letter's meta on its date. Only the GA notice before
 * foreclosure changes: from January 1, 2027 (SB 406 § 5) it is a 60-day
 * notice with the new threshold, and it no longer lists fines or fees.
 * The condominium notice (BL-155, § 44-3-109(c)) does not change: SB 406
 * amends no section of Article 3.
 */
export function letterMeta(kind: LetterKind, letterDate: string): LetterMeta {
  if (kind !== 'ga_pre_foreclosure' || letterDate < GA_232C_REPLACED_ON) return LETTER_META[kind]
  return {
    ...LETTER_META.ga_pre_foreclosure,
    label: 'Notice before foreclosure (§ 44-3-232(c), 60 days)',
    description:
      'Required at least 60 days before the association’s lien is foreclosed. Only once the assessments in arrears reach the lesser of $4,000 or 12 months of dues (at least $2,000), not counting fines or fees.',
    mailing: gaForeclosureLaw(letterDate).mailing,
    listsFines: false,
  }
}

/**
 * The letters a state's association can draft, statutory ones first.
 * `gaCondo` (BL-155): a Georgia condominium association gets the
 * Condominium Act letters instead of the POA Act ones.
 */
export function kindsFor(j: LetterJurisdiction, gaCondo = false): LetterKind[] {
  const own = LETTER_KINDS.filter(
    (k) => LETTER_META[k].jurisdiction === j && (j !== 'GA' || LETTER_META[k].gaAct === (gaCondo ? 'condo' : 'poa')),
  )
  return [...own, 'past_due']
}

// ─── input ───────────────────────────────────────────────────────────

export type LetterInput = Pick<
  EstoppelInput,
  'state' | 'associationType' | 'associationName' | 'propertyId' | 'address' | 'unitNumber' | 'unitId' | 'lotNumber' | 'owners' | 'charges' | 'payments' | 'plans' | 'planInstallmentIds' | 'timeZone'
> & {
  /**
   * BL-149: the association's Georgia SB 406 registration, verified on the
   * server (loadLetterContext). Set for Georgia associations only.
   */
  gaRegistration?: GaRegistrationStatusOnly
}

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
  /** CA: days after the due date an assessment is delinquent (§ 5650(b), the declaration's period). */
  delinquentAfterDays: number
}

/**
 * The past-due charges a letter lists. Past due = due before the letter
 * date and not fully paid. A California pre-lien notice lists only
 * assessments already DELINQUENT under § 5650(b): 15 days after the due
 * date, or the longer period the declaration sets (`delinquentAfterDays`,
 * a BLANK the board fills; never below 15). Late fees are listed once
 * past due.
 */
export function letterFigures(input: LetterInput, kind: LetterKind, letterDate: string, delinquentAfterDays: number = CA_DELINQUENT_AFTER_DAYS): LetterFigures {
  const days = Math.max(CA_DELINQUENT_AFTER_DAYS, Math.floor(delinquentAfterDays))
  const lines = chargeLines(input)
  const ledger = buildLedger(input.charges, input.payments, input.timeZone)
  const owedByToday = lines.filter((l) => l.dueDate <= letterDate && l.remainingCents > 0)
  const future = lines.filter((l) => l.dueDate > letterDate && l.remainingCents > 0)
  // The estoppel rule: balance less what isn't due yet, less what is owed
  // today, is money paid but not applied to a charge. Never a debit.
  const creditCents = Math.min(0, cents(ledger.totals.balance) - sum(future) - sum(owedByToday))

  const pastDue = owedByToday.filter((l) => l.dueDate < letterDate)
  const delinquent = (l: ChargeLine) => kind !== 'ca_pre_lien' || addCalendarDays(l.dueDate, days) <= letterDate
  const assessmentLines = pastDue.filter((l) => ASSESSMENT_TYPES.has(l.type) && delinquent(l))
  const lateFeeLines = pastDue.filter((l) => l.type === 'late_fee')
  const rest = pastDue.filter((l) => !ASSESSMENT_TYPES.has(l.type) && l.type !== 'late_fee')
  const listsFines = letterMeta(kind, letterDate).listsFines
  const otherLines = listsFines ? rest : []
  const omittedLines = [...(listsFines ? [] : rest), ...pastDue.filter((l) => ASSESSMENT_TYPES.has(l.type) && !delinquent(l))]

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
    delinquentAfterDays: days,
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
      const on = addCalendarDays(pending.dueDate, f.delinquentAfterDays)
      return {
        ok: false,
        reason: `No assessment is delinquent yet. Under § 5650(b) and your declaration an assessment becomes delinquent ${f.delinquentAfterDays} days after it is due: the oldest unpaid one, due ${formatDay(pending.dueDate)}, is delinquent on ${formatDay(on)}.`,
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
  if (kind === 'ga_condo_pre_foreclosure') {
    // BL-155: § 44-3-109(c), unchanged by SB 406: 30 days and $2,000.00.
    return {
      ok: true,
      note: `The lien may be foreclosed no sooner than 30 days after this notice is sent (${formatDay(addCalendarDays(letterDate, GA_CONDO_NOTICE_DAYS))} if sent on the letter date), and only for a lien of at least ${usdCents(GA_CONDO_FORECLOSURE_MIN_CENTS)} (§ 44-3-109(c)).`,
    }
  }
  if (kind === 'ga_pre_foreclosure') {
    const law = gaForeclosureLaw(letterDate)
    const by = formatDay(addCalendarDays(letterDate, law.days))
    return {
      ok: true,
      note: law.sb406
        ? `The lien may be foreclosed no sooner than 60 days after this notice is sent (${by} if sent on the letter date), and only once the regular and special assessments in arrears reach the lesser of $4,000.00 or 12 months of regular assessments, but at least $2,000.00. Fines, fees and other specific assessments don’t count (§ 44-3-232(c) as revised by SB 406 § 5).`
        : `The lien may be foreclosed no sooner than 30 days after this notice is sent (${by} if sent on the letter date), and only for a lien of at least ${usdCents(GA_FORECLOSURE_MIN_CENTS)}.`,
    }
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
    case 'ga_fee_notice':
      return { label: 'Earliest day attorney’s fees can be collected, if the owner receives it on the letter date (30 days from receipt)', day: addCalendarDays(letterDate, GA_FEE_NOTICE_DAYS) }
    case 'ga_pre_foreclosure': {
      const days = gaForeclosureLaw(letterDate).days
      return { label: `Earliest day to foreclose the lien, if sent on the letter date (${days} days)`, day: addCalendarDays(letterDate, days) }
    }
    case 'ga_condo_pre_foreclosure':
      return { label: 'Earliest day to foreclose the lien, if sent on the letter date (30 days)', day: addCalendarDays(letterDate, GA_CONDO_NOTICE_DAYS) }
    case 'past_due':
      return null
  }
}

// ─── Georgia checks on the figures (BL-148) ─────────────────────────

/** `day` plus whole years; Feb 29 falls back to Feb 28 in a common year. */
export function addYears(day: string, years: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const year = y + years
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const dd = m === 2 && d === 29 && !leap ? 28 : d
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

/**
 * § 44-3-232(b)(1): a late charge may not exceed the greater of $10.00 or
 * 10% of the assessment it is on. The ledger doesn't link a late fee to
 * its assessment, so a late fee above the cap for the LARGEST assessment
 * on the letter is flagged for the board to confirm (BL-147's caps). A
 * flag, not a block: the fee could be on an assessment already paid and
 * not listed.
 */
export function gaLateChargeNotes(f: LetterFigures, condo = false): string[] {
  if (f.lateFeeLines.length === 0) return []
  const law = LATE_FEE_LAWS.GA
  // BL-155: § 44-3-109(b)(1) sets the same cap for a condominium.
  const citation = condo ? GA_CONDO_LATE_CHARGE.cite : law.citation
  const largest = Math.max(0, ...f.assessmentLines.map((l) => l.amountCents))
  const cap = statutoryCapCents(law, largest)
  const over = f.lateFeeLines.filter((l) => l.amountCents > cap)
  if (over.length === 0) return []
  const one = over.length === 1
  return [
    `${one ? 'A late charge on this letter is' : `${over.length} late charges on this letter are`} above ${usdCents(cap)}, the most ${citation} allows on the largest assessment listed (the greater of $10.00 or 10%). Only authorized late charges belong on a Georgia notice: confirm ${one ? 'it' : 'them'} against your declaration, or waive the excess first.`,
  ]
}

/**
 * § 44-3-232(c): the lien lapses, as to an assessment and its late
 * charges and interest, four years after it first became due — six years
 * from January 1, 2027 (SB 406 § 5). Lines whose lien has lapsed, or
 * lapses within GA_LAPSE_WARN_DAYS, are named.
 *
 * From 2027, a charge whose four years ran out BEFORE January 1, 2027
 * lapsed under the law then in force. Whether SB 406's six years revive
 * that lien is not something the statute text answers, so such a charge is
 * named separately and the board is sent to its attorney.
 */
export function gaLapseNotes(f: LetterFigures, letterDate: string, condo = false): string[] {
  // BL-155: § 44-3-109(c) keeps four years for a condominium; SB 406 amends no section of Article 3.
  const years = condo ? GA_LIEN_LAPSE_YEARS : gaForeclosureLaw(letterDate).lapseYears
  const word = years === GA_LIEN_LAPSE_YEARS ? 'four' : 'six'
  const cite = condo ? '§ 44-3-109(c)' : '§ 44-3-232(c)'
  const lines = [...f.assessmentLines, ...f.lateFeeLines].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const warnBy = addCalendarDays(letterDate, GA_LAPSE_WARN_DAYS)
  const lapsedBefore2027 =
    years === GA_LIEN_LAPSE_YEARS ? [] : lines.filter((l) => addYears(l.dueDate, GA_LIEN_LAPSE_YEARS) < GA_232C_REPLACED_ON)
  const lapsed = lines.filter((l) => !lapsedBefore2027.includes(l) && addYears(l.dueDate, years) <= letterDate)
  const soon = lines.filter((l) => {
    if (lapsedBefore2027.includes(l)) return false
    const on = addYears(l.dueDate, years)
    return on > letterDate && on <= warnBy
  })
  const out: string[] = []
  if (lapsedBefore2027.length > 0) {
    const one = lapsedBefore2027.length === 1
    out.push(
      `The lien for ${one ? 'one charge' : `${lapsedBefore2027.length} charges`} lapsed before January 1, 2027, four years after ${one ? 'it was' : 'each was'} first due (the oldest due ${formatDay(lapsedBefore2027[0]!.dueDate)}), under the § 44-3-232(c) then in force. SB 406 lengthened the period to six years from that date; ask your attorney whether the lien secures ${one ? 'it' : 'them'} before relying on ${one ? 'it' : 'them'} in a foreclosure.`,
    )
  }
  if (lapsed.length > 0) {
    const one = lapsed.length === 1
    out.push(
      `The lien has lapsed for ${one ? 'one charge' : `${lapsed.length} charges`} first due ${word} or more years ago (the oldest due ${formatDay(lapsed[0]!.dueDate)}). The owner may still owe ${one ? 'it' : 'them'}, but the lien no longer secures ${one ? 'it' : 'them'} (${cite}). Ask your attorney before relying on ${one ? 'it' : 'them'} in a foreclosure.`,
    )
  }
  if (soon.length > 0) {
    const one = soon.length === 1
    out.push(
      `The lien for ${one ? 'one charge' : `${soon.length} charges`} lapses soon, ${word} years after ${one ? 'it was' : 'each was'} first due: the first on ${formatDay(addYears(soon[0]!.dueDate, years))} (${cite}).`,
    )
  }
  return out
}

/** Ledger types that are assessments for the 2027 threshold (§ 43-17A-1(8)–(9)); not specific assessments. */
const GA_THRESHOLD_TYPES = new Set(['regular', 'special'])

export interface GaForeclosureCount {
  /** Regular and special assessments in arrears, less unapplied credit: what counts toward the threshold. */
  countedCents: number
  /** Payment-plan installments on the letter, left out of the count (they may carry fees). */
  planCents: number
}

/**
 * BL-154: what counts toward the 2027 threshold. "No specific assessment
 * ... or other fine or fee shall be included": late charges, fines,
 * damage charges and collection fees are out. Payment-plan installments
 * are out too, because a plan can bundle fees and the ledger can't tell.
 * Interest is out: it is not an assessment.
 */
export function gaForeclosureCount(f: LetterFigures): GaForeclosureCount {
  const counted = f.assessmentLines.filter((l) => GA_THRESHOLD_TYPES.has(l.type)).reduce((t, l) => t + l.remainingCents, 0)
  const planCents = f.assessmentLines.filter((l) => l.type === 'plan_installment').reduce((t, l) => t + l.remainingCents, 0)
  return { countedCents: Math.max(0, counted + f.creditCents), planCents }
}

// ─── fields and BLANKs ───────────────────────────────────────────────

/** Money BLANKs added to the ledger amount, in the order printed. */
export const ENTERED_MONEY: Record<LetterKind, string[]> = {
  past_due: [],
  fl_late_notice: ['interest'],
  fl_intent_to_lien: ['interest', 'certifiedMail', 'otherCosts'],
  ca_pre_lien: ['collectionCosts', 'attorneyFees', 'interest'],
  tx_delinquency: [],
  ga_fee_notice: [],
  ga_pre_foreclosure: ['interest'],
  ga_condo_pre_foreclosure: ['interest'],
}

export function letterFields(kind: LetterKind, input: LetterInput, letterDate?: string): CertificateField[] {
  const owners = input.owners.map((o) => o.trim()).filter(Boolean)
  const fields: CertificateField[] = [
    { key: 'associationName', label: 'Association name', kind: 'text', value: input.associationName?.trim() || null },
    { key: 'owners', label: 'Owner(s) of record', kind: 'text', value: owners.length > 0 ? owners.join('; ') : null },
  ]
  if (isGaForeclosureKind(kind)) {
    // § 44-3-232(c): sent "both at the address of the lot and at any other
    // address or addresses which the lot owner may have designated";
    // § 44-3-109(c) says the same of the unit (BL-155).
    const condo = kind === 'ga_condo_pre_foreclosure'
    const home = [input.address?.trim(), input.unitNumber?.trim() ? `Unit ${input.unitNumber.trim()}` : null].filter(Boolean).join(', ')
    fields.push(
      {
        key: 'lotAddress',
        label: condo ? 'The unit’s address' : 'The lot’s address',
        kind: 'textarea',
        value: home || null,
        hint: condo ? 'The unit’s street address and unit number, with city, state and ZIP.' : 'The home’s street address, with city, state and ZIP.',
      },
      {
        key: 'designatedAddress',
        label: 'Other address(es) the owner designated in writing',
        kind: 'textarea',
        value: null,
        hint: condo
          ? 'Every other address the unit owner gave the association in writing. The notice goes to each one as well as the unit. Write “None” if there are none.'
          : 'Every other address the owner gave the association in writing. The notice goes to each one as well as the lot. Write “None” if there are none.',
      },
    )
  } else {
    fields.push({
      key: 'mailingAddress',
      label: 'Owner’s mailing address',
      kind: 'textarea',
      value: null,
      hint: 'The owner’s last address in the association’s records. If the owner lives at the home, write the home’s address.',
    })
  }
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
        key: 'delinquentDays',
        label: CA_DELINQUENT_DAYS_LABEL,
        kind: 'text',
        value: null,
        hint: `§ 5650(b): ${CA_DELINQUENT_AFTER_DAYS} days unless your declaration sets a longer period. Enter the number of days.`,
      },
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
  if (kind === 'ga_fee_notice') {
    fields.push({
      key: 'attorneyFees',
      label: 'Itemized attorney’s fees claimed',
      kind: 'textarea',
      value: null,
      hint: 'SB 406 § 7(f)(3): list each attorney’s fee the association claims, with its amount. Write “None claimed” if there are none yet. This list does not change the total.',
    })
  }
  if (kind === 'ga_pre_foreclosure' && letterDate !== undefined && letterDate >= GA_232C_REPLACED_ON) {
    fields.push({
      key: 'regularYear',
      label: GA_REGULAR_YEAR_LABEL,
      kind: 'money',
      value: null,
      hint: 'Your regular assessment (dues) for one year, e.g. $250 a month → $3,000. Not special or specific assessments. It sets the foreclosure threshold: the lesser of $4,000 or this amount, but at least $2,000 (§ 44-3-232(c)). Not printed on the letter.',
    })
  }
  if (kind === 'ga_pre_foreclosure') {
    fields.push(
      { key: 'interest', label: 'Interest owed', kind: 'money', value: null, hint: 'Only if your declaration provides for interest (§ 44-3-232(b)). Enter 0 if none.' },
      {
        key: 'interestRate',
        label: 'Interest rate (percent per year)',
        kind: 'text',
        value: null,
        hint: `The rate in your declaration, at most ${GA_MAX_INTEREST_PERCENT} (§ 44-3-232(b)(2)). Enter 0 if none is charged.`,
      },
    )
  }
  if (kind === 'ga_condo_pre_foreclosure') {
    fields.push(
      { key: 'interest', label: 'Interest owed', kind: 'money', value: null, hint: 'Only if your condominium instruments provide for interest (§ 44-3-109(b)). Enter 0 if none.' },
      {
        key: 'interestRate',
        label: 'Interest rate (percent per year)',
        kind: 'text',
        value: null,
        hint: `The rate in your condominium instruments, at most ${GA_MAX_INTEREST_PERCENT} (§ 44-3-109(b)(2)). Enter 0 if none is charged.`,
      },
    )
  }
  if (kind === 'past_due') {
    fields.push({ key: 'payBy', label: 'Please pay by', kind: 'text', value: null, hint: 'The date you ask the owner to pay by.' })
  }
  fields.push({ key: 'signer', label: 'Signed by (name and title)', kind: 'text', value: null, hint: 'A board member, officer or the association’s manager.' })
  return fields
}

export const GA_REGULAR_YEAR_LABEL = '12 months of regular assessments (dues) for this lot'

export const CA_DELINQUENT_DAYS_LABEL = `Days after due date an assessment is delinquent (per your declaration; at least ${CA_DELINQUENT_AFTER_DAYS})`

/** The board's delinquency period: a whole number of days, at least 15 (and at most a year), else null. */
export function parseDelinquentDays(s: string | undefined): number | null {
  const t = (s ?? '').trim()
  if (!/^\d{1,3}$/.test(t)) return null
  const n = Number(t)
  return n >= CA_DELINQUENT_AFTER_DAYS && n <= 365 ? n : null
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
  if (kind === 'fl_late_notice' || kind === 'fl_intent_to_lien' || kind === 'ca_pre_lien' || isGaForeclosureKind(kind)) {
    const raw = (values.interestRate ?? '').trim()
    const rate = parsePercent(raw)
    if (raw && rate === null) out.push('Enter the interest rate as a number, like 18 or 12.5.')
    if (kind === 'ca_pre_lien' && rate !== null && rate > CA_MAX_INTEREST_PERCENT) {
      out.push(`The interest rate can’t be above ${CA_MAX_INTEREST_PERCENT}% a year (§ 5650(b)(3)).`)
    }
    if (kind === 'ga_pre_foreclosure' && rate !== null && rate > GA_MAX_INTEREST_PERCENT) {
      out.push(`The interest rate can’t be above ${GA_MAX_INTEREST_PERCENT}% a year (§ 44-3-232(b)(2)).`)
    }
    if (kind === 'ga_condo_pre_foreclosure' && rate !== null && rate > GA_MAX_INTEREST_PERCENT) {
      out.push(`The interest rate can’t be above ${GA_MAX_INTEREST_PERCENT}% a year (§ 44-3-109(b)(2)).`)
    }
  }
  if (kind === 'ca_pre_lien') {
    const raw = (values.delinquentDays ?? '').trim()
    if (raw && parseDelinquentDays(raw) === null) {
      out.push(`Enter the delinquency period as a whole number of days, ${CA_DELINQUENT_AFTER_DAYS} or more (§ 5650(b)), up to 365.`)
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

/**
 * `values` are the board's BLANK entries; the figures read one of them,
 * the California delinquency period. Until it is filled (or while it is
 * not a valid number) the figures use the statute's 15 days, and the
 * empty BLANK or the entry problem blocks saving and printing.
 */
export function buildLetter(input: LetterInput, kind: LetterKind, letterDate: string, events: LetterEvent[], values: FieldValues = {}): Letter {
  const jurisdiction = letterJurisdiction(input.state)
  const meta = letterMeta(kind, letterDate)
  const figures = letterFigures(input, kind, letterDate, parseDelinquentDays(values.delinquentDays) ?? CA_DELINQUENT_AFTER_DAYS)
  const gaCondo = isGaCondo(input.state, input.associationType)
  const allowed = kindsFor(jurisdiction, gaCondo).includes(kind)
  const waiting: Waiting = allowed
    ? waitingCheck(kind, figures, events, letterDate)
    : meta.jurisdiction === 'GA' && jurisdiction === 'GA'
      ? {
          ok: false,
          reason:
            meta.gaAct === 'condo'
              ? 'This notice is under the Georgia Condominium Act, for a condominium association. This home’s association isn’t set up as a condominium.'
              : 'This notice is under the Georgia Property Owners’ Association Act, which does not apply to condominium associations (§ 44-3-235(b)). Use the condominium notice instead.',
          earliest: null,
        }
      : { ok: false, reason: `This letter is for ${meta.jurisdiction} associations, and this home’s association is not in ${meta.jurisdiction}.`, earliest: null }
  const notes: string[] = []
  if (figures.omittedLines.some((l) => !ASSESSMENT_TYPES.has(l.type))) {
    notes.push(kind === 'ca_pre_lien' ? CA_FINE_NOTE : kind === 'ga_pre_foreclosure' ? GA_2027_FINE_NOTE : FL_FINE_NOTE)
  }
  if (kind === 'ga_pre_foreclosure' && letterDate >= GA_232C_REPLACED_ON) {
    const { countedCents, planCents } = gaForeclosureCount(figures)
    notes.push(
      `Counted toward the foreclosure threshold: ${usdCents(countedCents)} of regular and special assessments in arrears${figures.creditCents !== 0 ? ', less unapplied payments and credits' : ''}. Late charges, interest, fines and fees don’t count (§ 44-3-232(c)).`,
    )
    if (planCents > 0) {
      notes.push(
        `Payment-plan installments (${usdCents(planCents)}) aren’t counted toward the threshold, because a plan can include fees and HomeownerHub can’t tell. If the plan is only for regular or special assessments, ask your attorney whether they count.`,
      )
    }
  }
  if (kind === 'ca_pre_lien' && figures.omittedLines.some((l) => ASSESSMENT_TYPES.has(l.type))) {
    notes.push(`Assessments less than ${figures.delinquentAfterDays} days past due are not delinquent yet (§ 5650(b)) and are left off.`)
  }
  if (kind === 'past_due') notes.push(GENERIC_NOTE)
  if (kind === 'ga_fee_notice') notes.push(GA_ATTORNEY_FEES_NOTE)
  if (kind === 'ga_fee_notice' || isGaForeclosureKind(kind)) notes.push(...gaLateChargeNotes(figures, kind === 'ga_condo_pre_foreclosure'))
  if (isGaForeclosureKind(kind)) notes.push(...gaLapseNotes(figures, letterDate, kind === 'ga_condo_pre_foreclosure'))
  return {
    kind,
    jurisdiction,
    meta,
    letterDate,
    figures,
    fields: letterFields(kind, input, letterDate),
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
  const total = letterTotals(letter, values).totalCents ?? 0
  if (total <= 0) return 'The total owed is not above zero.'
  if (letter.kind === 'ga_condo_pre_foreclosure' && total < GA_CONDO_FORECLOSURE_MIN_CENTS) {
    // BL-155: § 44-3-109(c), unchanged by SB 406.
    return `The total is ${usdCents(total)}. Georgia permits no foreclosure of the lien unless it is at least ${usdCents(GA_CONDO_FORECLOSURE_MIN_CENTS)} (§ 44-3-109(c)), so this notice can’t be sent yet.`
  }
  if (letter.kind === 'ga_pre_foreclosure' && letter.letterDate >= GA_232C_REPLACED_ON) {
    const twelve = parseMoneyCents(values.regularYear ?? '')
    if (twelve === null) return `Enter ${GA_REGULAR_YEAR_LABEL.toLowerCase()} as an amount.`
    const threshold = gaForeclosureThresholdCents(twelve)
    const { countedCents } = gaForeclosureCount(letter.figures)
    if (countedCents < threshold) {
      return `The regular and special assessments in arrears total ${usdCents(countedCents)}. Since January 1, 2027, Georgia permits no foreclosure of the lien unless it is at least ${usdCents(threshold)}: the lesser of $4,000.00 or 12 months of regular assessments (${usdCents(twelve)}), but not less than $2,000.00, counting no fine, fee or other specific assessment (§ 44-3-232(c)). So this notice can’t be sent yet.`
    }
  } else if (letter.kind === 'ga_pre_foreclosure' && total < GA_FORECLOSURE_MIN_CENTS) {
    return `The total is ${usdCents(total)}. Georgia permits no foreclosure of the lien unless it is at least ${usdCents(GA_FORECLOSURE_MIN_CENTS)} (§ 44-3-232(c)), so this notice can’t be sent yet.`
  }
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
  const implied = LETTER_META[kind].stage ?? statusImpliedBy(LETTER_META[kind].eventType)
  if (!implied) return null
  return COLLECTION_STATUSES.indexOf(implied) > COLLECTION_STATUSES.indexOf(current) ? implied : null
}

// ─── the state law check (BL-130) ────────────────────────────────────

/** A letter already printed on this case, as the state law check reads it. */
export interface PrintedLetterRecord {
  kind: LetterKind
  /** The first print's timestamp (audit_log created_at). */
  printedAt: string
}

/** Printed letters as association days, for the check's waiting periods. */
export function printedLetters(records: readonly PrintedLetterRecord[], timeZone: string): PrintedLetter[] {
  return records.flatMap((r) => {
    const day = dayOf(r.printedAt, timeZone)
    return day ? [{ kind: r.kind, printedOn: day }] : []
  })
}

/**
 * BL-130: the state law check on this letter, from the association's
 * stored state (not the letter's jurisdiction, which folds every state
 * without letters of its own into "generic"), the charge types the letter
 * lists, and the case's history.
 */
export function letterLawCheck(
  input: Pick<LetterInput, 'state' | 'associationType' | 'timeZone' | 'gaRegistration'>,
  letter: Letter,
  values: FieldValues,
  events: LetterEvent[],
  printed: readonly PrintedLetterRecord[],
): DriftCheck {
  const f = letter.figures
  return checkCollectionsLetter({
    gaRegistration: input.gaRegistration,
    state: input.state,
    // BL-155: the SB 406 § 7 fee rules are Article 6's, not a condominium's.
    gaCondo: isGaCondo(input.state, input.associationType),
    kind: letter.kind,
    letterDate: letter.letterDate,
    listedChargeTypes: [...f.assessmentLines, ...f.lateFeeLines, ...f.otherLines].map((l) => l.type),
    values,
    events,
    printed: printedLetters(printed, input.timeZone),
  })
}
