/**
 * BL-077 — the one rule for what a year-end closing entry is.
 *
 * closePeriod (lib/periods.ts) zeroes every income and expense account into
 * fund balance by posting journal entries with `source = 'closing'` (each
 * also gets a `closing_entries` row; the source column is what every report
 * already reads, so it is the rule).
 *
 * Who must leave them out: anything that sums income or expense ACTIVITY
 * for a period — income statement, budget vs actual, cash-flow movements,
 * the board packet and month-end board report built on those, the budget
 * draft's trailing actuals. Counting them makes a closed year read as a
 * year with no activity.
 *
 * Who must keep them: position reports — balance sheet and trial balance.
 * The close is how net income reaches fund balance; without it a closed
 * year's balance sheet would carry that income twice (once in fund
 * balance, once as income-to-date) or not at all in fund balance.
 */
export const CLOSING_ENTRY_SOURCE = 'closing'

export function isClosingEntry(je: { source: string | null | undefined }): boolean {
  return je.source === CLOSING_ENTRY_SOURCE
}

/** The entries that count toward a period's income and expense activity. */
export function withoutClosingEntries<T extends { source: string | null | undefined }>(jes: T[]): T[] {
  return jes.filter((je) => !isClosingEntry(je))
}
