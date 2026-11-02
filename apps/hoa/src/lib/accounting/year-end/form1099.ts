// B9 — the per-vendor year-end 1099-NEC summary. Pure: no I/O.
//
// A worksheet for the board or CPA to file from. The app does not e-file and
// does not decide who must receive a form.
//
// IRS sources, read 2026-11-02 (confirm before filing; see list below):
//  - Instructions for Forms 1099-MISC and 1099-NEC, "Revised 12/2026",
//    https://www.irs.gov/instructions/i1099mec : the 1099-NEC minimum was
//    raised to $2,000 for payments after 2025 (may be inflation-adjusted from
//    calendar year 2027). So $2,000 applies to tax year 2026.
//  - Box names on the 2026 Form 1099-NEC per that page: 1a Nonemployee
//    Compensation; 1b Cash Tips; 1c Treasury Tipped Occupation Code(s);
//    1d Overtime Compensation; 2 Payer Made Direct Sales Totaling $5,000 or
//    More; 3 Excess Golden Parachute Payments; 4 Federal Income Tax Withheld;
//    5-7 State Information.
//  - Same page, read raw 2026-11-02: payments made by card go on Form 1099-K;
//    "Generally, payments to a corporation" need no form, except items such as
//    legal fees; Form 1099-NEC is filed "on or before January 31".
//  Not checked: weekend or holiday shifts of that date, and the printed form
//  layout. The UI tells the reader to check every figure.

import { csvDocument } from '@/lib/csv'
import type { NecCandidate } from './model'

/** $2,000 for payments made in 2026 (IRS instructions rev. 12/2026, read 2026-11-02). */
export const FORM_1099_NEC_2026_THRESHOLD_CENTS = 200_000
export const FORM_1099_NEC_TAX_YEAR = 2026

/**
 * The 1099-NEC minimum for payments made in a calendar year: $600 through 2025,
 * $2,000 from 2026. The IRS may adjust it for inflation from 2027, so check
 * this each year.
 */
export function form1099NecMinimumCents(calendarYear: number): number {
  return calendarYear >= FORM_1099_NEC_TAX_YEAR ? FORM_1099_NEC_2026_THRESHOLD_CENTS : 60_000
}

export const FORM_1099_NOT_TAX_ADVICE =
  'This is a worksheet from the association’s books, not tax advice. The board or its CPA must check every figure, decide who gets a form, and file. Payments to a corporation are generally left out, but legal fees can still count. HomeownerHub does not file anything with the IRS.'

export interface VendorAddress {
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
}

export interface Vendor1099Row {
  vendorId: string
  name: string
  dba: string | null
  addressLines: string[]
  /** Last four of the tax ID only, or null. The full number never leaves the loader. */
  tinLast4: string | null
  w9OnFile: boolean | null
  totalCents: number
  cardCents: number
  /** Total less card payments: the likely Box 1a amount, for the CPA to confirm. */
  box1aCents: number
  payments: number
  /** At or over the tax-year threshold for the form. */
  meetsThreshold: boolean
}

/** Last four of a tax ID's digits, or null when there are fewer than four. */
export function tinLast4(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

export function addressLines(a: VendorAddress | null | undefined): string[] {
  if (!a) return []
  const l1 = [a.line1, a.line2].filter(Boolean).join(', ')
  const l2 = [a.city, a.state, a.postal_code].filter(Boolean).join(' ')
  return [l1, l2].filter((s) => s.trim() !== '')
}

export function build1099Rows(
  candidates: readonly NecCandidate[],
  extra: ReadonlyMap<string, { tinLast4: string | null; address: VendorAddress | null }>,
  thresholdCents: number = FORM_1099_NEC_2026_THRESHOLD_CENTS,
): Vendor1099Row[] {
  return candidates
    .filter((c) => c.vendorId != null)
    .map((c) => {
      const x = extra.get(c.vendorId!)
      const box1a = Math.max(0, c.totalCents - c.cardCents)
      return {
        vendorId: c.vendorId!,
        name: c.vendorName,
        dba: c.dba,
        addressLines: addressLines(x?.address),
        tinLast4: x?.tinLast4 ?? null,
        w9OnFile: c.w9OnFile,
        totalCents: c.totalCents,
        cardCents: c.cardCents,
        box1aCents: box1a,
        payments: c.payments,
        meetsThreshold: box1a >= thresholdCents,
      }
    })
}

const dollars = (c: number): number => Math.round(c) / 100
const yesNo = (b: boolean | null): string => (b == null ? 'Unknown' : b ? 'Yes' : 'No')

export function form1099Csv(rows: readonly Vendor1099Row[], year: number): string {
  const t = form1099Table(rows, year)
  return csvDocument(t.header, t.rows)
}

export function form1099Table(rows: readonly Vendor1099Row[], year: number) {
  return {
    header: [
      'Vendor',
      'DBA',
      'Address',
      'Tax ID (last 4 only)',
      'W-9 on file',
      `Total paid in ${year}`,
      'Paid by card',
      'Box 1a nonemployee compensation (total less card)',
      'At or over the form threshold',
      'Payments',
      'Note',
    ],
    rows: rows.map((r) => [
      r.name,
      r.dba,
      r.addressLines.join(', '),
      r.tinLast4 ? `***-**-${r.tinLast4}` : 'Not on file',
      yesNo(r.w9OnFile),
      dollars(r.totalCents),
      dollars(r.cardCents),
      dollars(r.box1aCents),
      r.meetsThreshold ? 'Yes' : 'No',
      r.payments,
      'Worksheet only. Board or CPA must confirm entity type, amounts and whether a form is due.',
    ]),
  }
}
