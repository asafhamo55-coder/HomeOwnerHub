// BL-126 — the roster import's balances, handed to the opening-balance
// wizard in the same browser tab.
//
// The import never sends balances to the server (they are "for reference
// only"). When the board follows the import's link to enter opening
// balances, the rows are kept in sessionStorage for this tab so step 2 can
// offer them. Nothing is stored server-side, and the entry is removed once
// read into the wizard. Storage can be unavailable (private windows,
// blocked site data): every access is wrapped, and the wizard works without
// it (paste or upload instead).

export interface RosterBalance {
  address: string
  unit: string | null
  balance: number
}

const KEY = 'hh.opening-balances.roster'

export function saveRosterBalances(rows: readonly RosterBalance[]): void {
  try {
    if (rows.length === 0) window.sessionStorage.removeItem(KEY)
    else window.sessionStorage.setItem(KEY, JSON.stringify(rows))
  } catch {
    // Storage unavailable: the wizard still takes a paste or a file.
  }
}

export function readRosterBalances(): RosterBalance[] | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const rows = parsed.filter(
      (r): r is RosterBalance =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as RosterBalance).address === 'string' &&
        typeof (r as RosterBalance).balance === 'number' &&
        Number.isFinite((r as RosterBalance).balance),
    )
    return rows.length > 0 ? rows : null
  } catch {
    return null
  }
}

export function clearRosterBalances(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}
