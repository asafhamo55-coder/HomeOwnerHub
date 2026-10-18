/**
 * The pure half of "record a sale" (Properties P3): input validation and
 * the ownership-period math. No Supabase and no Next, so the dialog
 * validates with exactly the rules the server action applies, and the
 * property page's model can share the period semantics. See sale.ts.
 */

import { isPlausibleEmail } from '../contact-links'

// ─── Input and validation (pure) ─────────────────────────────────────

export const MAX_BUYERS = 6

export interface BuyerInput {
  name: string
  email: string | null
  phone: string | null
  mailingAddress: string | null
  /** Ownership share in percent; the buyers' shares add up to 100. */
  pct: number
}

export interface SaleInput {
  settlementDate: string
  buyers: BuyerInput[]
  /** Keep the current tenants (and their leases) with the home. */
  carryTenants: boolean
  /** List the buyers on the household list as owner residents. */
  addBuyersAsResidents: boolean
}

export interface RawBuyer {
  name?: unknown
  email?: unknown
  phone?: unknown
  mailingAddress?: unknown
  pct?: unknown
}

export interface RawSale {
  settlementDate?: unknown
  buyers?: unknown
  carryTenants?: unknown
  addBuyersAsResidents?: unknown
}

export type SaleValidation =
  | { ok: true; value: SaleInput }
  | { ok: false; error: string; fieldErrors: Record<string, string> }

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** A real calendar day 'YYYY-MM-DD' (not 2026-02-30). */
export function isCalendarDay(s: string): boolean {
  const m = DAY.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === s
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const orNull = (s: string): string | null => (s ? s : null)
const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * Check a sale before anything is read. `today` is the association's day.
 *
 * The settlement date may not be in the future: portal access follows
 * `valid_to IS NULL` (0012/0061), not dates, so closing the seller's
 * ownership ends their access at once and the buyer's begins at once —
 * the code cannot keep a seller active until a later settlement. A sale
 * is recorded on or after the day it settles.
 *
 * Field keys: settlementDate, buyers, buyers.<i>.<field>.
 */
export function validateSale(raw: RawSale, today: string): SaleValidation {
  const fieldErrors: Record<string, string> = {}

  const settlementDate = str(raw.settlementDate)
  if (!settlementDate) fieldErrors.settlementDate = 'Enter the settlement date.'
  else if (!isCalendarDay(settlementDate)) fieldErrors.settlementDate = 'Enter a real date, like 2026-10-15.'
  else if (settlementDate > today) {
    fieldErrors.settlementDate = 'The settlement date can’t be in the future. Record the sale on or after the day it settles.'
  } else if (settlementDate < '1900-01-01') fieldErrors.settlementDate = 'Enter a settlement date after 1900.'

  const list = Array.isArray(raw.buyers) ? (raw.buyers as RawBuyer[]) : []
  if (list.length === 0) fieldErrors.buyers = 'Add the buyer.'
  if (list.length > MAX_BUYERS) fieldErrors.buyers = `A sale can have at most ${MAX_BUYERS} buyers.`

  const buyers: BuyerInput[] = []
  const seen = new Set<string>()
  list.slice(0, MAX_BUYERS).forEach((b, i) => {
    const name = str(b.name)
    const email = str(b.email)
    const phone = str(b.phone)
    const mailingAddress = str(b.mailingAddress)
    const key = (f: string) => `buyers.${i}.${f}`

    if (!name) fieldErrors[key('name')] = 'Enter the buyer’s name.'
    else if (name.length > 200) fieldErrors[key('name')] = 'Keep the name under 200 characters.'
    if (email) {
      if (email.length > 200 || !isPlausibleEmail(email)) fieldErrors[key('email')] = 'Enter a valid email, like name@example.com.'
      else if (seen.has(lower(email))) fieldErrors[key('email')] = 'Two buyers can’t share an email.'
      seen.add(lower(email))
    }
    if (phone.length > 50) fieldErrors[key('phone')] = 'Keep the phone under 50 characters.'
    if (mailingAddress.length > 500) fieldErrors[key('mailingAddress')] = 'Keep the mailing address under 500 characters.'

    let pct = 100
    if (list.length > 1) {
      const n = typeof b.pct === 'number' ? b.pct : Number(str(b.pct))
      if (str(b.pct) === '' && typeof b.pct !== 'number') fieldErrors[key('pct')] = 'Enter this buyer’s share.'
      else if (!Number.isFinite(n) || n <= 0 || n > 100) fieldErrors[key('pct')] = 'Enter a share between 0 and 100.'
      else if (Math.round(n * 100) !== n * 100) fieldErrors[key('pct')] = 'Use at most two decimals.'
      pct = n
    }
    buyers.push({ name, email: orNull(email), phone: orNull(phone), mailingAddress: orNull(mailingAddress), pct })
  })

  if (list.length > 1 && !fieldErrors.buyers && !Object.keys(fieldErrors).some((k) => k.endsWith('.pct'))) {
    const total = buyers.reduce((t, b) => t + Math.round(b.pct * 100), 0)
    if (total !== 10_000) fieldErrors.buyers = `The buyers’ shares add up to ${total / 100}%. They need to add up to 100%.`
  }

  const addBuyersAsResidents = raw.addBuyersAsResidents === true
  if (!addBuyersAsResidents) {
    buyers.forEach((b, i) => {
      if (b.mailingAddress) {
        fieldErrors[`buyers.${i}.mailingAddress`] =
          'A mailing address is kept on the buyer’s household entry. Turn on “Add the buyers to the household list”, or leave it blank.'
      }
    })
  }

  if (Object.keys(fieldErrors).length > 0) {
    const first = fieldErrors.settlementDate ?? fieldErrors.buyers ?? Object.values(fieldErrors)[0]!
    return { ok: false, error: first, fieldErrors }
  }
  return { ok: true, value: { settlementDate, buyers, carryTenants: raw.carryTenants === true, addBuyersAsResidents } }
}

// ─── Ownership period math (pure) ────────────────────────────────────

/**
 * The day a seller's ownership ends: the settlement date, but never before
 * the row's own valid_from (0004's CHECK valid_to >= valid_from). An
 * imported ownership dated by the import day can start after a sale the
 * board is recording late; it then ends the day it began.
 */
export function closingDay(settlementDate: string, validFrom: string): string {
  const from = validFrom.slice(0, 10)
  return settlementDate > from ? settlementDate : from
}

/**
 * An ownership period is [valid_from, valid_to): the day it closes is the
 * buyer's first day, so a sale recorded today shows the seller as a
 * previous owner today, not as a co-owner alongside the buyer.
 */
export function ownershipStatus(
  o: { valid_from: string; valid_to: string | null },
  today: string,
): 'current' | 'past' | 'future' {
  if (o.valid_to !== null && o.valid_to.slice(0, 10) <= today) return 'past'
  if (o.valid_from.slice(0, 10) > today) return 'future'
  return 'current'
}

/** A household note line for the buyer's mailing address. */
export function mailingNote(address: string): string {
  return `Mailing address: ${address}`
}
