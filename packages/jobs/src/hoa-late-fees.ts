import {
  createAdminClient,
  loadAccountingRefs,
  postJournalEntry,
} from '@homeowner-portal/db'
import { M3_APPLIED } from '@homeowner-portal/db/m3'
import { inngest } from './client'
import { readAll } from './read-all'
import { ASSOCIATION_ZONE_COLUMNS, associationTimeZone, todayIn } from './association-time'

const HOA_LATE_FEE_RATE = 0.05 // 5% — typical default; per-row override later.

/** assessments.source the opening-balances executor writes (migration 0067, BL-136). */
export const OPENING_BALANCE_SOURCE = 'opening_balance'

/** memo_code `.in()` lists are chunked so the request URL stays small. */
const MEMO_CHUNK = 150

type Db = ReturnType<typeof createAdminClient>
type QueryError = { code?: string; message?: string }

export interface DefaultedAssessment {
  id: string
  unit_id: string
  fiscal_period_id: string
  amount: number
  assessment_type: string
}

function readFailed(what: string, e: QueryError): Error {
  // Code only: a PostgrestError message/details can echo row values.
  return new Error(`hoa-late-fees: ${what} read failed (${e.code ?? 'no code'})`)
}

/**
 * Every defaulted, non-late-fee assessment in `associationId` that has no
 * late fee booked yet.
 *
 * Both reads page to the end and THROW on failure (BL-047). Before:
 *  - the defaulted read was capped at PostgREST's 1000 rows, so charges
 *    past the first 1000 waited for later nights;
 *  - the "already charged?" read put every source id in ONE `.in()` and
 *    ignored its error. At a large association that URL overflows, the
 *    read fails, `existing` came back null, and every source looked
 *    uncharged — a second late fee on each. A failed read now fails the
 *    step (Inngest retries it) instead of charging.
 */
export async function findUnchargedDefaults(
  db: Db,
  associationId: string,
  today: string,
  skipOpeningBalances: boolean = M3_APPLIED,
): Promise<{ defaulted: DefaultedAssessment[]; uncharged: DefaultedAssessment[] }> {
  const defaulted = await readAll<DefaultedAssessment>(
    (from, to) => {
      let q = db
        .from('assessments')
        .select('id, unit_id, fiscal_period_id, amount, assessment_type')
        .eq('association_id', associationId)
        .in('status', ['open', 'partial'])
        .lt('due_date', today)
        .neq('assessment_type', 'late_fee')
      // BL-136 (migration 0067): a balance carried over by the opening-
      // balances approval was late at the previous manager, not here, so it
      // never earns a late fee. `source` is NULL for every other charge, and
      // NULL <> 'opening_balance' is NULL in SQL, hence the explicit is.null.
      if (skipOpeningBalances) q = q.or(`source.is.null,source.neq.${OPENING_BALANCE_SOURCE}`)
      return q
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: DefaultedAssessment[] | null; error: QueryError | null }>
    },
    (e) => readFailed('defaulted assessments', e),
  )

  const memoCodes = defaulted.map((a) => `LATE-${a.id}`)
  const alreadyCharged = new Set<string>()
  for (let i = 0; i < memoCodes.length; i += MEMO_CHUNK) {
    const part = memoCodes.slice(i, i + MEMO_CHUNK)
    const rows = await readAll<{ memo_code: string | null }>(
      (from, to) =>
        db
          .from('assessments')
          .select('id, memo_code')
          .eq('association_id', associationId)
          .eq('assessment_type', 'late_fee')
          .in('memo_code', part)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: { memo_code: string | null }[] | null; error: QueryError | null }>,
      (e) => readFailed('existing late fees', e),
    )
    for (const r of rows) if (r.memo_code) alreadyCharged.add(r.memo_code)
  }

  return { defaulted, uncharged: defaulted.filter((a) => !alreadyCharged.has(`LATE-${a.id}`)) }
}

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
    // One instant for the whole run; each association reads its own day
    // from it (BL-043). The UTC day was right at midnight Eastern only by
    // accident, and a day early for an association west of Eastern.
    const now = new Date()

    // All HOA associations — joined to their org so the `hub_type` filter
    // stays applied even though we're now keyed on association_id.
    const { data: associations, error } = await db
      .from('associations')
      .select(`id, name, organization_id, ${ASSOCIATION_ZONE_COLUMNS}, orgs:organization_id(hub_type)`)

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
        const today = todayIn(associationTimeZone(assoc), now)
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
        // A failed read charges NOTHING for this association tonight (as a
        // failed defaulted read always did) — never charge from a partial
        // "already charged" set. Caught here so other associations still run.
        let found: Awaited<ReturnType<typeof findUnchargedDefaults>>
        try {
          found = await findUnchargedDefaults(db, assoc.id, today)
        } catch (e) {
          logger.warn(`[hoa-late-fees] ${assoc.id}: ${e instanceof Error ? e.message : 'read failed'}; skipping`)
          return { evaluated: 0, charged: 0, skipped: 0 }
        }
        const { defaulted, uncharged } = found
        if (defaulted.length === 0) {
          return { evaluated: 0, charged: 0, skipped: 0 }
        }

        let charged = 0
        let skipped = defaulted.length - uncharged.length

        for (const src of uncharged) {
          const memoCode = `LATE-${src.id}`

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

        return { evaluated: defaulted.length, charged, skipped }
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
