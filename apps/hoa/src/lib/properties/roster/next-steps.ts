/**
 * What the board can do right after a roster import. Pure, so the client
 * component that shows it can import it.
 */
import type { ClassifiedRow } from './classify'
import type { RowResult } from './commit'

/**
 * Imported rows (anything that did not fail) that carried an owner email.
 * Read from the rows already in the browser, so the done screen needs no
 * extra query.
 */
export function importedEmailCount(
  classified: readonly Pick<ClassifiedRow, 'row'>[],
  results: readonly Pick<RowResult, 'row' | 'status'>[],
): number {
  const handled = new Set(results.filter((r) => r.status !== 'error').map((r) => r.row))
  return classified.filter((c) => handled.has(c.row.row) && !!c.row.ownerEmail).length
}
