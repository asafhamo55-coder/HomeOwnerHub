/**
 * Pure label helpers for dashboard rows, kept out of queries.ts (which
 * imports the server client) so they can be unit-tested directly.
 */

/**
 * The home an overdue-dues row names, in the same "address · unit" form as
 * a cure-deadline row. A single-family home has no unit number, which used
 * to leave the row reading just "Unit · $8,975".
 */
export function overdueUnitLabel(
  unit: { address_line1: string | null; unit_number: string | null } | null,
): string {
  const address = unit?.address_line1?.trim()
  const number = unit?.unit_number?.trim()
  if (address) return number ? `${address} · ${number}` : address
  return number ? `Unit ${number}` : 'Home not on file'
}

const MS_DAY = 86_400_000

/**
 * How long an approval has been pending: "waiting 3 days", "waiting
 * 1 month". Under a day reads "new today", not "waiting today".
 */
export function waitingLabel(iso: string | null, now: number = Date.now()): string {
  if (!iso) return ''
  const ms = now - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  if (ms < MS_DAY) return 'new today'
  const days = Math.floor(ms / MS_DAY)
  if (days < 30) return `waiting ${days === 1 ? '1 day' : `${days} days`}`
  const months = Math.floor(days / 30)
  return `waiting ${months === 1 ? '1 month' : `${months} months`}`
}
