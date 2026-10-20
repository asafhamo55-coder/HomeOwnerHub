import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { bankReconciliationAgent } from '@homeowner-portal/workflows'
import { meterJobAi } from '@homeowner-portal/jobs/ai-usage'
import { isAiPausedError } from '@homeowner-portal/ai/guard'
import { aiPausedError } from '@/lib/api/ai-spend'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireBearerSecret } from '@/lib/api/secrets'
import { parseJson } from '@/lib/api/parse'
import { zDateOnly, zText, zUuid } from '@/lib/api/schemas'
import { MAX_SHORT_TEXT } from '@/lib/api/limits'
import { checkWrite } from '@/lib/api/db'
import { logRouteFailure } from '@/lib/api/log'

/**
 * Manual bank-transaction ingest. Despite the path, this is NOT a Plaid
 * webhook (C-05): nothing registers it with Plaid (link-token sets no
 * `webhook` URL) and real Plaid data arrives through `plaidSyncJob`
 * (packages/jobs/src/plaid-sync.ts). It accepts one synthetic transaction
 * at a time so W18 can be exercised end-to-end. A real Plaid handler
 * (JWT `Plaid-Verification`) would need its own verification and a
 * Plaid-shaped body.
 *
 * Auth (RC-7): `Authorization: Bearer <PLAID_INGEST_SECRET>`, timing-safe.
 * Unset secret → 503 not_configured; wrong/missing → 401.
 *
 * Payload (camelCase, money in integer cents — RC-8 / RC-11):
 *   {
 *     bankAccountId:        uuid          // bank_accounts.id
 *     amountCents:          integer ≠ 0   // positive = inbound, negative = outbound
 *                                         // (the stored convention; plaid-sync negates
 *                                         //  Plaid's own sign into this one)
 *     postedDate:           "YYYY-MM-DD"
 *     memo?:                string | null
 *     merchant?:            string | null
 *     plaidTransactionId?:  string        // idempotency key (unique column)
 *   }
 *
 * Response:
 *   200 { ok: true, bankTransactionId, w18: { matchMethod, confidence, notes, runId, status } }
 *   Errors use the RC-1 envelope. A persistence or W18 failure is a 500 so
 *   the sender retries; a retry with the same plaidTransactionId reuses the
 *   stored row and re-runs W18.
 */

// Money on the wire is signed integer cents here (outbound is negative), so
// the shared non-negative zCents does not fit. Same ±$1B bound.
const zSignedCents = z
  .number()
  .int()
  .min(-100_000_000_000)
  .max(100_000_000_000)
  .refine((v) => v !== 0, 'amountCents cannot be zero')

const IngestSchema = z
  .object({
    bankAccountId: zUuid,
    amountCents: zSignedCents,
    postedDate: zDateOnly,
    memo: zText(MAX_SHORT_TEXT).nullable().optional(),
    merchant: zText(MAX_SHORT_TEXT).nullable().optional(),
    plaidTransactionId: zText(200, 1).optional(),
  })
  .strict()

type Ingest = z.infer<typeof IngestSchema>

// One transaction with a few short strings; 64 KB is far more than enough
// (lowered from the 1 MB default on purpose).
const MAX_INGEST_BYTES = 64 * 1024

type Db = ReturnType<typeof createAdminClient>

export const POST = withRoute('webhooks.plaid_ingest', async (request: Request) => {
  requireBearerSecret(request, 'PLAID_INGEST_SECRET') // 503 unset / 401 mismatch
  const value = await parseJson(request, IngestSchema, { maxBytes: MAX_INGEST_BYTES })

  const db = createAdminClient()

  // The org comes from the bank account, never from the request.
  const { data: bankAcct, error: acctErr } = await db
    .from('bank_accounts')
    .select('organization_id')
    .eq('id', value.bankAccountId)
    .maybeSingle()
  if (acctErr) {
    logRouteFailure('webhooks.plaid_ingest.bank_account', acctErr)
    throw new ApiRouteError('internal')
  }
  if (!bankAcct) throw new ApiRouteError('not_found', 'That bank account does not exist.')
  const organizationId = bankAcct.organization_id

  const bankTransactionId = await findOrInsertTxn(db, organizationId, value)

  // Fire W18. The workflow handles its own audit logging via ai_runs.
  let result: Awaited<ReturnType<typeof bankReconciliationAgent.execute>>
  try {
    // BL-112: a machine call no user's bucket pays for — W18's Step D model
    // call is metered at platform level (`ai.usage.job.plaid_webhook`).
    result = await meterJobAi(
      'job.plaid_webhook',
      () => bankReconciliationAgent.execute({ bankTransactionId }, { organizationId }),
      { orgId: organizationId },
    )
  } catch (err) {
    // AI_PLATFORM_KILL_SWITCH: the transaction is stored; answer the
    // friendly 503 so the sender retries later instead of logging a 500.
    if (isAiPausedError(err)) throw aiPausedError()
    // The transaction is stored; a retry reuses it and re-runs W18.
    logRouteFailure('webhooks.plaid_ingest.w18', err, { organizationId, bankTransactionId })
    throw new ApiRouteError('internal', undefined, { reason: 'reconciliation_failed', bankTransactionId })
  }

  return NextResponse.json({
    ok: true,
    bankTransactionId,
    w18: {
      matchMethod: result.output.matchMethod,
      confidence: result.output.confidence,
      notes: result.output.notes,
      runId: result.runId,
      status: result.status,
    },
  })
})

async function findExisting(db: Db, plaidTransactionId: string, organizationId: string): Promise<string | null> {
  const { data, error } = await db
    .from('bank_transactions')
    .select('id')
    .eq('plaid_transaction_id', plaidTransactionId)
    // Org-scoped: a delivery for org A must never resolve to org B's row.
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) {
    logRouteFailure('webhooks.plaid_ingest.lookup', error, { organizationId })
    throw new ApiRouteError('internal')
  }
  return data?.id ?? null
}

/**
 * Idempotent on plaidTransactionId: a retried delivery reuses the stored
 * row. A concurrent duplicate that loses the race on the unique column
 * (23505) re-reads the winner instead of failing. Lookups are scoped to the
 * bank account's org; an id already used by another org is a 409.
 */
async function findOrInsertTxn(db: Db, organizationId: string, input: Ingest): Promise<string> {
  if (input.plaidTransactionId) {
    const existing = await findExisting(db, input.plaidTransactionId, organizationId)
    if (existing) return existing
  }

  const { data, error } = await db
    .from('bank_transactions')
    .insert({
      organization_id: organizationId,
      bank_account_id: input.bankAccountId,
      // bank_transactions.amount is numeric dollars; the one cents → dollars conversion.
      amount: input.amountCents / 100,
      posted_date: input.postedDate,
      memo: input.memo ?? null,
      merchant: input.merchant ?? null,
      plaid_transaction_id: input.plaidTransactionId ?? null,
    })
    .select('id')
    .single()

  if (error && String(error.code) === '23505' && input.plaidTransactionId) {
    const winner = await findExisting(db, input.plaidTransactionId, organizationId)
    if (winner) return winner
  }
  // A 23505 left over here means the id is taken by another org's row.
  checkWrite({ error }, 'webhooks.plaid_ingest.insert', { organizationId }, {
    conflict: { reason: 'duplicate_transaction_id', message: 'That transaction id is already in use.' },
  })
  if (!data) throw new ApiRouteError('internal')
  return data.id
}
