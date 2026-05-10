import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from './client'

const HOA_LATE_FEE_RATE = 0.05 // 5% — typical default; configurable per-row later.

/**
 * At midnight ET each day, find HOA dues rows that are now past due and
 * (a) flip their status from 'pending' to 'late' and (b) stamp on a
 * computed late fee if one wasn't already set. Idempotent — re-running
 * the same day or after a partial failure doesn't double-charge.
 *
 * Loops per HOA org in its own Inngest step so:
 *  - one org's bad data can't poison the others' runs (per-step retries)
 *  - logs always carry org context for debugging
 *  - the SELECT only ever pulls one tenant's rows into memory at a time
 *
 * Updates also scope by org_id for defense-in-depth — even if a stale due
 * id leaked in from another org, the WHERE would prevent the cross-tenant
 * write.
 */
export const hoaLateFeeJob = inngest.createFunction(
  { id: 'hoa-late-fees', name: 'HOA Late Fee Calculation' },
  { cron: 'TZ=America/New_York 0 0 * * *' },
  async ({ step, logger }) => {
    const db = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)

    const { data: orgs, error } = await db
      .from('orgs')
      .select('id')
      .eq('hub_type', 'hoa')

    if (error) {
      logger.error('[hoa-late-fees] failed to load orgs', error)
      throw new Error(error.message)
    }

    let totalEvaluated = 0
    let totalUpdated = 0

    for (const org of orgs ?? []) {
      const orgId = org.id as string

      const result = await step.run(`late-fees-${orgId}`, async () => {
        const { data: dues, error: duesError } = await db
          .from('hoa_dues')
          .select('id, amount_due, late_fee, status')
          .eq('org_id', orgId)
          .eq('status', 'pending')
          .lt('due_date', today)

        if (duesError) {
          logger.warn(
            `[hoa-late-fees] org ${orgId} read failed: ${duesError.message}`,
          )
          return { evaluated: 0, updated: 0 }
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
            .eq('org_id', orgId)

          if (updateError) {
            logger.warn(
              `[hoa-late-fees] org ${orgId} due ${due.id} update failed: ${updateError.message}`,
            )
            continue
          }
          updated += 1
        }

        return { evaluated: (dues ?? []).length, updated }
      })

      totalEvaluated += result.evaluated
      totalUpdated += result.updated
    }

    return {
      processed: (orgs ?? []).length,
      evaluated: totalEvaluated,
      updated: totalUpdated,
    }
  },
)
