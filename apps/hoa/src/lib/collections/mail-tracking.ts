/**
 * BL-166: how and when a collections notice was mailed and delivered.
 * Pure and browser-safe (no I/O, no Next imports): the server actions
 * validate with it, the loader folds events with it, the letter check and
 * the screens read it. All of it sits behind M7_APPLIED
 * (packages/db/src/m7.ts): with the flag off nothing here is called with
 * data and the app behaves as before.
 *
 * collection_events is append-only (0047). A delivery learned later is a
 * NEW event that repeats the tracking number (or names the same letter);
 * the record for a letter is the fold of those events, oldest first, the
 * newest non-empty value winning.
 *
 * Why delivered_on: Georgia's two clocks run from receipt, not from the
 * print date. SB 406 § 7(f)(2) gives the owner "30 days from the receipt
 * of the notice", and the lien may be foreclosed no sooner than 30 days
 * (60 from 2027-01-01, § 44-3-232(c) as SB 406 § 5 revises it) after the
 * notice is sent by certified mail or statutory overnight delivery. Only
 * those two methods satisfy the statute, so a delivery by any other
 * method never starts a clock here.
 */

import { addCalendarDays } from '@/lib/properties/estoppel/business-days'

export const MAIL_METHODS = ['certified', 'statutory_overnight', 'first_class', 'email', 'hand'] as const
export type MailMethod = (typeof MAIL_METHODS)[number]

export const MAIL_METHOD_LABELS: Record<MailMethod, string> = {
  certified: 'Certified mail',
  statutory_overnight: 'Statutory overnight delivery',
  first_class: 'First-class mail',
  email: 'Email',
  hand: 'Hand delivery',
}

/** The two ways the Georgia statutes accept for these notices. */
export const STATUTORY_MAIL_METHODS: readonly MailMethod[] = ['certified', 'statutory_overnight']

export const isMailMethod = (v: unknown): v is MailMethod => typeof v === 'string' && (MAIL_METHODS as readonly string[]).includes(v)
export const isStatutoryMethod = (m: MailMethod | null | undefined): boolean => m === 'certified' || m === 'statutory_overnight'

/** SB 406 § 9(a): the 60-day text is in force from this day (mirrors statute-drift GA_SB406_2027_FROM). */
const GA_60_DAY_FROM = '2027-01-01'
export const GA_FEE_NOTICE_WAIT_DAYS = 30

export interface MailRecord {
  method: MailMethod | null
  trackingNumber: string | null
  mailedOn: string | null
  deliveredOn: string | null
}

/** The mail columns of one collection_events row, with what ties it to a letter. */
export interface MailEvent extends MailRecord {
  note: string | null
  createdAt: string
}

export const EMPTY_MAIL: MailRecord = { method: null, trackingNumber: null, mailedOn: null, deliveredOn: null }

export const hasMail = (e: MailRecord): boolean => e.method !== null

/**
 * The note on the event that records a letter's mailing. Like
 * letterEventNote (letters/audit.ts) it carries the approval request id
 * only: no name, address or entry.
 */
export const MAILING_NOTE_PREFIX = 'Mailing record for letter '
export const mailingNote = (approvalRequestId: string): string => `${MAILING_NOTE_PREFIX}${approvalRequestId}`

/** Letters' own print event (letters/audit.ts letterEventNote), which a mailing can also be recorded against. */
const PRINT_NOTE_PREFIX = 'Printed from approved letter '

const noteMentions = (note: string | null, requestId: string): boolean =>
  note === mailingNote(requestId) || note === `${PRINT_NOTE_PREFIX}${requestId}`

/**
 * The mailing record of ONE letter: every event that names the letter (its
 * mailing events and its print event) plus any event repeating a tracking
 * number those carry, folded oldest first so the newest non-empty value
 * wins. Null when nothing was recorded.
 */
export function mailRecordFor(requestId: string, events: readonly MailEvent[]): MailRecord | null {
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const direct = sorted.filter((e) => noteMentions(e.note, requestId))
  const numbers = new Set(direct.map((e) => e.trackingNumber).filter((t): t is string => t !== null && t !== ''))
  const related = sorted.filter((e) => noteMentions(e.note, requestId) || (e.trackingNumber !== null && numbers.has(e.trackingNumber)))
  let out: MailRecord = { ...EMPTY_MAIL }
  for (const e of related) {
    if (!hasMail(e)) continue
    out = {
      method: e.method ?? out.method,
      trackingNumber: e.trackingNumber ?? out.trackingNumber,
      mailedOn: e.mailedOn ?? out.mailedOn,
      deliveredOn: e.deliveredOn ?? out.deliveredOn,
    }
  }
  return hasMail(out) ? out : null
}

/** The day the clock starts from: delivered_on, and only for a method the statute accepts. */
export function clockStartOf(rec: MailRecord | null | undefined): string | null {
  if (!rec || !isStatutoryMethod(rec.method)) return null
  return rec.deliveredOn
}

/**
 * First day the owner's 30 days to pay (SB 406 § 7(f)(2)) have run: the
 * delivery day plus 30. The attorney-fee Confirm passes from this day.
 */
export function feeNoticeCleanOn(deliveredOn: string): string {
  return addCalendarDays(deliveredOn, GA_FEE_NOTICE_WAIT_DAYS)
}

/** 30 days, or 60 for a notice sent on or after 2027-01-01. */
export function foreclosureWaitDays(sentOn: string): 30 | 60 {
  return sentOn >= GA_60_DAY_FROM ? 60 : 30
}

/**
 * The first day the lien may be foreclosed, counting from delivery. `sentOn`
 * picks the 30- or 60-day text (the mailing day, else the print day).
 */
export function foreclosureEligibleOn(sentOn: string, deliveredOn: string): string {
  return addCalendarDays(deliveredOn, foreclosureWaitDays(sentOn))
}

/**
 * The earliest foreclosure day for a Georgia notice kind: a condominium's
 * notice always waits 30 days (§ 44-3-232 does not apply to it), the
 * Article 6 notice 30 or 60 by the date it was sent.
 */
export function foreclosureEligibleOnFor(kind: string, sentOn: string, deliveredOn: string): string {
  return kind === 'ga_condo_pre_foreclosure' ? addCalendarDays(deliveredOn, 30) : foreclosureEligibleOn(sentOn, deliveredOn)
}

/** A one-line description for the letters list and the event list. */
export function describeMail(rec: MailRecord): string {
  const parts: string[] = []
  if (rec.method) parts.push(MAIL_METHOD_LABELS[rec.method])
  if (rec.trackingNumber) parts.push(`tracking ${rec.trackingNumber}`)
  if (rec.mailedOn) parts.push(`mailed ${rec.mailedOn}`)
  if (rec.deliveredOn) parts.push(`delivered ${rec.deliveredOn}`)
  return parts.join(' · ')
}

export interface MailFieldsInput {
  mailMethod?: string | null
  trackingNumber?: string | null
  mailedOn?: string | null
  deliveredOn?: string | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validate what the board typed. Mirrors the CHECKs in 0072 so a refusal is
 * a sentence, not a Postgres code: a number or date needs a method,
 * delivered_on is not before mailed_on, neither date is in the future.
 */
export function validateMailFields(
  v: MailFieldsInput,
  today: string,
): { ok: true; record: MailRecord | null } | { ok: false; error: string } {
  const method = v.mailMethod ?? null
  const tracking = (v.trackingNumber ?? '').trim() || null
  const mailed = v.mailedOn || null
  const delivered = v.deliveredOn || null
  if (method === null || method === '') {
    if (tracking || mailed || delivered) return { ok: false, error: 'Choose how it was mailed before adding a tracking number or dates.' }
    return { ok: true, record: null }
  }
  if (!isMailMethod(method)) return { ok: false, error: 'Choose how it was mailed from the list.' }
  if (tracking && tracking.length > 100) return { ok: false, error: 'A tracking number is at most 100 characters.' }
  for (const d of [mailed, delivered]) {
    if (d && !DAY.test(d)) return { ok: false, error: 'Use a YYYY-MM-DD date.' }
    if (d && d > today) return { ok: false, error: 'That date is in the future.' }
  }
  if (mailed && delivered && delivered < mailed) return { ok: false, error: 'It cannot be delivered before it was mailed.' }
  return { ok: true, record: { method, trackingNumber: tracking, mailedOn: mailed, deliveredOn: delivered } }
}
