// Pure helpers for the "close period" checks. Imported by the server action
// and by client components, so keep this file free of server-only imports.
import { formatDay } from '@/lib/money/format'

/** A period can be closed once its last day is behind today (association's day). */
export function periodHasEnded(endDate: string, today: string): boolean {
  return endDate < today
}

/** A count that was read, or one we could not read. Never default a failure to 0. */
export type CountRead = { ok: true; n: number } | { ok: false }

export interface CloseChecks {
  /** Draft journal entries dated inside the period. */
  drafts: CountRead
  /** Bank proposals waiting for a board decision. */
  proposals: CountRead
  /** Names of bank accounts not reconciled through the period end. */
  unreconciled: { ok: true; accounts: string[] } | { ok: false }
}

/** Bank accounts whose last approved reconciliation is before the period end (or missing). */
export function unreconciledAccounts(
  accounts: { id: string; name: string }[],
  lastReconciled: Map<string, string>,
  endDate: string,
): string[] {
  return accounts
    .filter((a) => {
      const at = lastReconciled.get(a.id)
      return !at || at.slice(0, 10) < endDate
    })
    .map((a) => a.name)
}

export const COULD_NOT_CHECK_DRAFTS = 'We couldn’t check for drafts.'
export const COULD_NOT_CHECK_PROPOSALS = 'We couldn’t check for bank proposals.'
export const COULD_NOT_CHECK_RECONCILIATIONS = 'We couldn’t check bank reconciliations.'

export interface CloseWarning {
  text: string
  /** True when the check itself failed, so nothing was verified. */
  unverified: boolean
}

export function closeWarnings(checks: CloseChecks, endDate: string): CloseWarning[] {
  const out: CloseWarning[] = []
  if (!checks.drafts.ok) out.push({ text: COULD_NOT_CHECK_DRAFTS, unverified: true })
  else if (checks.drafts.n > 0) {
    const n = checks.drafts.n
    out.push({
      text: `${n} draft journal ${n === 1 ? 'entry is' : 'entries are'} dated in this period. ${n === 1 ? 'It' : 'They'} won’t be included.`,
      unverified: false,
    })
  }
  if (!checks.proposals.ok) out.push({ text: COULD_NOT_CHECK_PROPOSALS, unverified: true })
  else if (checks.proposals.n > 0) {
    const n = checks.proposals.n
    out.push({ text: `${n} bank ${n === 1 ? 'proposal is' : 'proposals are'} waiting for review.`, unverified: false })
  }
  if (!checks.unreconciled.ok) out.push({ text: COULD_NOT_CHECK_RECONCILIATIONS, unverified: true })
  else {
    for (const name of checks.unreconciled.accounts) {
      out.push({ text: `${name} isn’t reconciled through ${formatDay(endDate)}.`, unverified: false })
    }
  }
  return out
}
