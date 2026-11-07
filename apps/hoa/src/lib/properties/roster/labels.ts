import { formatAddressLines } from '../address-format'
import { OWNER_NAME_MISSING, type OwnerRosterRow } from '../statutory-roster/model'

/**
 * Mailing labels from the owner roster (Avery 5160 / 8160: 30 labels per
 * letter sheet, 3 across by 10 down). Pure: no database, no logging, so a
 * test can pin the address choice, the fit and the paging without any setup.
 */

export const LABELS_PER_SHEET = 30

/** Font steps, largest first, and how many characters fit on one printed line at each. */
export const FONT_STEPS = [
  { pt: 10, chars: 28 },
  { pt: 9, chars: 31 },
  { pt: 8, chars: 35 },
] as const

export type FontPt = (typeof FONT_STEPS)[number]['pt']

/** Names may wrap to this many lines; the street and the city line take one each. */
export const NAME_LINES = 2

export interface MailingLabel {
  propertyId: string
  /** Printed lines, top to bottom: addressee, street, "City, ST ZIP". Never empty strings. */
  lines: string[]
  /** The largest font step at which the label fits (10, 9 or 8). */
  fontPt: FontPt
  /** True when even the smallest step cuts text (an ellipsis is printed). */
  shortened: boolean
}

/** Owner names for the first line: "Pat Lee & Sam Lee". "Current Resident" when none is recorded. */
export function addressee(owners: OwnerRosterRow['owners']): string {
  const names = owners.map((o) => o.name.trim()).filter((n) => n && n !== OWNER_NAME_MISSING)
  return names.length ? names.join(' & ') : 'Current Resident'
}

/**
 * Pick the font step from character counts. `lines` is [names, street, city line];
 * names get NAME_LINES lines, every other line gets one.
 */
export function fitFont(lines: readonly string[]): { fontPt: FontPt; shortened: boolean } {
  for (const step of FONT_STEPS) {
    const fits = lines.every((l, i) => l.length <= step.chars * (i === 0 ? NAME_LINES : 1))
    if (fits) return { fontPt: step.pt, shortened: false }
  }
  return { fontPt: FONT_STEPS[FONT_STEPS.length - 1]!.pt, shortened: true }
}

/**
 * Owners who cannot be reached by email: no usable address (blank or spaces
 * only) or, where e-consent applies, no consent to electronic notices.
 * `noConsentEmails` holds lowercased addresses of owners the notice rules
 * (planOfficialNotice) would not email.
 */
export function isUnreachableByEmail(owner: OwnerRosterRow['owners'][number], noConsentEmails: ReadonlySet<string> = new Set()): boolean {
  const email = owner.email?.trim().toLowerCase()
  return !email || noConsentEmails.has(email)
}

/** True when the home has an owner on file and every owner is unreachable by email: a paper-only home. */
export function isPaperOnly(row: OwnerRosterRow, noConsentEmails: ReadonlySet<string> = new Set()): boolean {
  return row.owners.length > 0 && row.owners.every((o) => isUnreachableByEmail(o, noConsentEmails))
}

/**
 * The address block for one home. A mailing address on file wins; otherwise
 * the property address (with its unit) is used. Both go through the standard
 * USPS formatter. Null when there is no street to put on a label.
 */
export function labelFor(row: OwnerRosterRow): MailingLabel | null {
  const [street, place] =
    row.mailing.source === 'on_file'
      ? formatAddressLines(row.mailing.text)
      : formatAddressLines(row.address, row.unitNumber)
  if (!street.trim()) return null
  const lines = [addressee(row.owners), street, place].filter((l) => l.trim().length > 0)
  return { propertyId: row.propertyId, lines, ...fitFont(lines) }
}

const normalize = (lines: readonly string[]) => lines.map((l) => l.replace(/\s+/g, ' ').trim().toLowerCase()).join('\n')

export interface LabelSet {
  labels: MailingLabel[]
  /** Labels left out because an identical one was already in the list (an owner of several lots). */
  duplicates: number
  /** Labels still shortened at the smallest font. */
  shortened: number
}

export function buildLabels(
  rows: readonly OwnerRosterRow[],
  opts: { onlyPaper?: boolean; noConsentEmails?: ReadonlySet<string> } = {},
): LabelSet {
  const labels: MailingLabel[] = []
  const seen = new Set<string>()
  let duplicates = 0
  for (const row of rows) {
    if (opts.onlyPaper && !isPaperOnly(row, opts.noConsentEmails)) continue
    const label = labelFor(row)
    if (!label) continue
    const key = normalize(label.lines)
    if (seen.has(key)) {
      duplicates += 1
      continue
    }
    seen.add(key)
    labels.push(label)
  }
  return { labels, duplicates, shortened: labels.filter((l) => l.shortened).length }
}

/** Sheets of 30, in order. The last sheet is short; blanks are not padded. */
export function paginate<T>(labels: readonly T[], perSheet = LABELS_PER_SHEET): T[][] {
  const sheets: T[][] = []
  for (let i = 0; i < labels.length; i += perSheet) sheets.push(labels.slice(i, i + perSheet))
  return sheets
}
