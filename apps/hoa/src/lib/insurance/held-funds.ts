/**
 * BL-142: the money an association holds today, for the fidelity-bond
 * adequacy check (./analysis.ts fidelityAdequacy).
 *
 *  - reserve: the BL-120 reserve snapshot's balance (reserve-fund assets
 *    less liabilities, lib/accounting/reserves.ts); null with no reserve fund.
 *  - operating: operating cash (account 1010) on the balance sheet, the
 *    same figure the month-end board report shows; null when the chart of
 *    accounts has no such account.
 *
 * Not a server action; called from the /insurance server component with
 * the board's own RLS-bound client. Throws on a failed read (the page
 * says "couldn't load", never zeros).
 */

import { computeBalanceSheet, type AccountingDb } from '@/lib/accounting/queries'
import { loadReserveSnapshot } from '@/lib/accounting/reserves'
import { cashPosition } from '@/lib/monthly-report/model'

export interface HeldFunds {
  reserveBalance: number | null
  operatingCash: number | null
}

export async function loadHeldFunds(db: AccountingDb, associationId: string, today: string): Promise<HeldFunds> {
  const [reserves, sheet] = await Promise.all([
    loadReserveSnapshot(db, associationId, today),
    computeBalanceSheet(associationId, today, db),
  ])
  return {
    reserveBalance: reserves.result.kind === 'ready' ? reserves.result.snapshot.balance : null,
    operatingCash: cashPosition(sheet).operating,
  }
}
