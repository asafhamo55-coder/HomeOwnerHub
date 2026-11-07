import { formatAddressLines } from '../address-format'
import type { OwnerRosterRow } from '../statutory-roster/model'

/**
 * Mailing labels from the owner roster (Avery 5160 / 8160: 30 labels per
 * letter sheet, 3 across by 10 down). Pure: no database, no logging, so a
 * test can pin the address choice and the paging without any setup.
 */

export const LABELS_PER_SHEET = 30

export interface MailingLabel {
  propertyId: string
  /** Printed lines, top to bottom: addressee, street, "City, ST ZIP". Never empty strings. */
  lines: string[]
}

const NAME_MISSING = 'Name not recorded'

/** Owner names for the first line: "Pat Lee & Sam Lee". "Current Resident" when none is recorded. */
export function addressee(owners: OwnerRosterRow['owners']): string {
  const names = owners.map((o) => o.name.trim()).filter((n) => n && n !== NAME_MISSING)
  return names.length ? names.join(' & ') : 'Current Resident'
}

/** True when the home has an owner on file and none of them has an email: a paper-only home. */
export function isPaperOnly(row: OwnerRosterRow): boolean {
  return row.owners.length > 0 && row.owners.every((o) => !o.email)
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
  return { propertyId: row.propertyId, lines }
}

export function buildLabels(rows: readonly OwnerRosterRow[], opts: { onlyWithoutEmail?: boolean } = {}): MailingLabel[] {
  const out: MailingLabel[] = []
  for (const row of rows) {
    if (opts.onlyWithoutEmail && !isPaperOnly(row)) continue
    const label = labelFor(row)
    if (label) out.push(label)
  }
  return out
}

/** Sheets of 30, in order. The last sheet is short; blanks are not padded. */
export function paginate<T>(labels: readonly T[], perSheet = LABELS_PER_SHEET): T[][] {
  const sheets: T[][] = []
  for (let i = 0; i < labels.length; i += perSheet) sheets.push(labels.slice(i, i + perSheet))
  return sheets
}
