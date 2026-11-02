'use server'

// The board's "Check again" on the reconciliation screen (design 3.8 step 5):
// a bank deposit often posts a day or two after Stripe's payout event, so the
// match is tried again on demand. Board/admin only, re-checked here because a
// server action is a public endpoint. Dark behind M8_APPLIED. Counts only.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getAccountingContext } from '@/lib/accounting/queries'
import { matchPendingPayouts } from './payouts'
import { createSupabasePayoutPorts } from './payouts-store'

export type RecheckPayoutsResult = { ok: true; checked: number; matched: number } | { ok: false; error: string }

export async function recheckStripePayouts(): Promise<RecheckPayoutsResult> {
  if (!M8_APPLIED) return { ok: false, error: 'Online payments aren’t available yet.' }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  try {
    const ctx = await getAccountingContext()
    if (!ctx || ctx.organizationId !== gate.orgId) return { ok: false, error: 'We couldn’t find your books.' }
    const ports = createSupabasePayoutPorts(createAdminClient(), {
      // Matching never reads Stripe: the fees were stored when the payout arrived.
      listPayoutBalanceLines: async () => {
        throw new Error('not used when re-matching')
      },
    })
    const r = await matchPendingPayouts(ctx.associationId, ports)
    revalidatePath('/accounting/bank')
    return { ok: true, ...r }
  } catch (err) {
    console.error('[payouts] recheck failed', { error: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'We couldn’t check just now. Nothing was changed. Try again in a moment.' }
  }
}
