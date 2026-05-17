import {
  createAdminClient,
  loadAccountingRefs,
  postJournalEntry,
} from '@homeowner-portal/db'
import { inngest } from './client'

const HOA_LATE_FEE_RATE = 0.05 // 5% — typical default; per-row override later.

/**
 * At midnight ET each day, find open/partial assessments past their due
 * date and (a) generate a `late_fee` assessment for each one, (b) post a
 * Dr AR / Cr Late Fee Income JE for it.
 *
 * Idempotency lives in `assessments.memo_code` — each late-fee row stamps
 * `LATE-<sourceAssessmentId>`, and the cron skips any source that already
 * has one. So re-running the same day, or recovering from a partial
 * failure, never double-charges. (memo_code's other use, Pay-by-Zelle
 * matching per ADR-005, uses a different shape `MP-1247-DUES`, so they
 * don't collide.)
 *
 * Loops per HOA association in its own Inngest step so:
 *  - one tenant's bad data can't poison the others' runs (per-step retries)
 *  - logs always carry association context for debugging
 *  - the SELECT only ever pulls one tenant's rows into memory at a time
 */
export const hoaLateFeeJob = inngest.createFunction(
  { id: 'hoa-late-fees', name: 'HOA Late Fee Calculation' },
  { cron: 'TZ=America/New_York 0 0 * * *' },
  async ({ step, logger }) => {
    const db = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)

    // All HOA associations — joined to their org so the `hub_type` filter
    // stays applied even though we're now keyed on association_id.
    const { data: associations, error } = await db
      .from('associations')
      .select('id, name, organization_id, orgs:organization_id(hub_type)')

    if (error) {
      logger.error('[hoa-late-fees] failed to load associations', error)
      throw new Error(error.message)
    }

    const hoaAssocs = (associations ?? []).filter((a) => {
      const org = a.orgs as { hub_type: string } | null
      return org?.hub_type === 'hoa'
    })

    let totalEvaluated = 0
    let totalCharged = 0
    let totalSkipped = 0

    for (const assoc of hoaAssocs) {
      const result = await step.run(`late-fees-${assoc.id}`, async () => {
        // Resolve accounting refs once per association.
        const refs = await loadAccountingRefs(db, assoc.id)
        if (!refs) {
          logger.warn(
            `[hoa-late-fees] ${assoc.name} ${assoc.id}: accounting not seeded, skipping`,
          )
          return { evaluated: 0, charged: 0, skipped: 0 }
        }

        // Defaulted, non-late-fee assessments. We never compound: a
        // late_fee that itself goes overdue is not eligible to spawn
        // another late_fee.
        const { data: defaulted, error: dErr } = await db
          .from('assessments')
          .select('id, unit_id, fiscal_period_id, amount, assessment_type')
          .eq('association_id', assoc.id)
          .in('status', ['open', 'partial'])
          .lt('due_date', today)
          .neq('assessment_type', 'late_fee')

        if (dErr) {
          logger.warn(
            `[hoa-late-fees] ${assoc.name} read failed: ${dErr.message}`,
          )
          return { evaluated: 0, charged: 0, skipped: 0 }
        }

        const sourceIds = (defaulted ?? []).map((a) => a.id)
        if (sourceIds.length === 0) {
          return { evaluated: 0, charged: 0, skipped: 0 }
        }

        // Find which sources already have a late fee booked — single
        // round-trip rather than one-per-source.
        const memoCodes = sourceIds.map((id) => `LATE-${id}`)
        const { data: existing } = await db
          .from('assessments')
          .select('memo_code')
          .eq('association_id', assoc.id)
          .eq('assessment_type', 'late_fee')
          .in('memo_code', memoCodes)
        const alreadyCharged = new Set(
          (existing ?? [])
            .map((r) => r.memo_code)
            .filter((c): c is string => !!c),
        )

        let charged = 0
        let skipped = 0

        for (const src of defaulted ?? []) {
          const memoCode = `LATE-${src.id}`
          if (alreadyCharged.has(memoCode)) {
            skipped += 1
            continue
          }

          const feeAmount = Math.round(
            Number(src.amount) * HOA_LATE_FEE_RATE * 100,
          ) / 100
          if (feeAmount <= 0) {
            skipped += 1
            continue
          }

          // Late fee inherits the parent's due_date — the original
          // delinquency moment. Some boards want today's date instead;
          // making it configurable is out of scope.
          const { data: lateFee, error: insErr } = await db
            .from('assessments')
            .insert({
              organization_id: assoc.organization_id,
              association_id: assoc.id,
              unit_id: src.unit_id,
              fiscal_period_id: src.fiscal_period_id,
              assessment_type: 'late_fee',
              amount: feeAmount,
              due_date: today,
              memo_code: memoCode,
              status: 'open',
            })
            .select('id')
            .single()

          if (insErr || !lateFee) {
            logger.warn(
              `[hoa-late-fees] ${assoc.name} insert late_fee for ${src.id} failed: ${insErr?.message}`,
            )
            continue
          }

          const je = await postJournalEntry(db, {
            organizationId: assoc.organization_id,
            associationId: assoc.id,
            fiscalPeriodId: src.fiscal_period_id,
            entryDate: today,
            memo: `Late fee: ${memoCode}`,
            source: 'recurring',
            sourceId: lateFee.id,
            lines: [
              {
                accountId: refs.acctAR,
                fundId: refs.fundOperating,
                debit: feeAmount,
                credit: 0,
              },
              {
                accountId: refs.acctLateFeeIncome,
                fundId: refs.fundOperating,
                debit: 0,
                credit: feeAmount,
              },
            ],
          })

          if (!je.ok) {
            // Roll back the late-fee row so we don't show a charge that
            // left no ledger trace.
            await db.from('assessments').delete().eq('id', lateFee.id)
            logger.warn(
              `[hoa-late-fees] ${assoc.name} JE failed for ${memoCode}: ${je.error}`,
            )
            continue
          }

          charged += 1
        }

        return { evaluated: (defaulted ?? []).length, charged, skipped }
      })

      totalEvaluated += result.evaluated
      totalCharged += result.charged
      totalSkipped += result.skipped
    }

    return {
      associations: hoaAssocs.length,
      evaluated: totalEvaluated,
      charged: totalCharged,
      skipped: totalSkipped,
    }
  },
)
