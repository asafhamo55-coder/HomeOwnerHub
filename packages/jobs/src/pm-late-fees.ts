import { createAdminClient } from '@homeownerhub/db'
import { inngest } from './client'

/**
 * At midnight ET each day, walk PM rent ledger rows that are now past due
 * and stamp on a computed late fee per row's late_fee_rate (defaults to 5
 * if missing). pm_rent_ledger.status doesn't strictly need to flip
 * because the dashboard derives "X days late" from due_date in real time;
 * we only persist the late_fee here so the user sees the same number
 * across sessions.
 */
export const pmLateFeeJob = inngest.createFunction(
  { id: 'pm-late-fees', name: 'PM Late Fee Calculation' },
  { cron: 'TZ=America/New_York 0 0 * * *' },
  async ({ logger }) => {
    const db = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)

    const { data: rows, error } = await db
      .from('pm_rent_ledger')
      .select('id, amount_due, late_fee, late_fee_rate, status')
      .neq('status', 'paid')
      .lt('due_date', today)
      .is('late_fee', null) // idempotency: only stamp on rows we haven't yet.

    if (error) {
      logger.error('[pm-late-fees] failed to load ledger', error)
      throw new Error(error.message)
    }

    let updated = 0
    for (const row of rows ?? []) {
      const ratePct = (row.late_fee_rate as number | null) ?? 5
      const computed = Math.round(
        (((row.amount_due as number) ?? 0) * ratePct) / 100,
      )

      const { error: updateError } = await db
        .from('pm_rent_ledger')
        .update({ late_fee: computed, status: 'late' })
        .eq('id', row.id as string)

      if (updateError) {
        logger.warn(
          `[pm-late-fees] could not update ledger ${row.id}: ${updateError.message}`,
        )
        continue
      }
      updated += 1
    }

    return { evaluated: (rows ?? []).length, updated }
  },
)
