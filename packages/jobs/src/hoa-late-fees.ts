import { createAdminClient } from '@homeownerhub/db'
import { inngest } from './client'

const HOA_LATE_FEE_RATE = 0.05 // 5% — typical default; configurable per-row later.

/**
 * At midnight ET each day, find HOA dues rows that are now past due and
 * (a) flip their status from 'pending' to 'late' and (b) stamp on a
 * computed late fee if one wasn't already set. Idempotent — re-running
 * the same day or after a partial failure doesn't double-charge.
 */
export const hoaLateFeeJob = inngest.createFunction(
  { id: 'hoa-late-fees', name: 'HOA Late Fee Calculation' },
  { cron: 'TZ=America/New_York 0 0 * * *' },
  async ({ logger }) => {
    const db = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)

    const { data: dues, error } = await db
      .from('hoa_dues')
      .select('id, amount_due, late_fee, status')
      .eq('status', 'pending')
      .lt('due_date', today)

    if (error) {
      logger.error('[hoa-late-fees] failed to load dues', error)
      throw new Error(error.message)
    }

    let updated = 0
    for (const due of dues ?? []) {
      const computedFee =
        (due.late_fee as number | null) ??
        Math.round(((due.amount_due as number) ?? 0) * HOA_LATE_FEE_RATE)

      const { error: updateError } = await db
        .from('hoa_dues')
        .update({ status: 'late', late_fee: computedFee })
        .eq('id', due.id as string)

      if (updateError) {
        logger.warn(
          `[hoa-late-fees] could not update due ${due.id}: ${updateError.message}`,
        )
        continue
      }
      updated += 1
    }

    return { evaluated: (dues ?? []).length, updated }
  },
)
