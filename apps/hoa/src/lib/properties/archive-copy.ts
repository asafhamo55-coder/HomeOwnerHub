// Copy for the property "Archive" confirm. Pure (vitest node harness).
//
// "Archive", not "Delete": deleteProperty sets deleted_at — the home
// leaves the list, and its residents, violations and dues stay on file.
// Archiving a home that still owes money or has open violations hides
// live work, so the dialog names both when they exist.

export function archiveDescription({
  address,
  balance,
  openViolations,
}: {
  address: string
  /** Null when the stats could not be read. */
  balance: number | null
  openViolations: number | null
}): { body: string; warning: string | null } {
  const body = `${address} leaves the property list. Its residents, violations and dues stay on file.`
  if (balance === null || openViolations === null) {
    return { body, warning: 'We couldn’t check this home’s balance or open violations. Check them before archiving.' }
  }
  const parts: string[] = []
  if (balance > 0) parts.push(`a ${balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} open balance`)
  if (openViolations > 0) parts.push(`${openViolations} open ${openViolations === 1 ? 'violation' : 'violations'}`)
  return { body, warning: parts.length ? `This home still has ${parts.join(' and ')}.` : null }
}
