import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { bankReconciliationAgent } from '@homeowner-portal/workflows'

/**
 * Manual Plaid ingest endpoint. Real Plaid webhook wiring (HMAC sig,
 * Plaid Sandbox account linking, batch transaction pull every 4 hours)
 * is deferred — this endpoint just accepts one synthetic transaction at
 * a time so the rest of the system can be exercised end-to-end without
 * Plaid keys.
 *
 * Auth: a shared secret in PLAID_INGEST_SECRET. The secret is REQUIRED
 * in production; if unset, the endpoint refuses to run. (We never
 * silently bypass auth on a public POST.)
 *
 * Payload:
 *   {
 *     bankAccountId:        uuid          // bank_accounts.id
 *     amount:               number        // positive = inbound, negative = outbound
 *     postedDate:           "YYYY-MM-DD"
 *     memo?:                string | null
 *     merchant?:            string | null
 *     plaidTransactionId?:  string        // for idempotency on Plaid's side
 *   }
 *
 * Response:
 *   200 { ok: true, bankTransactionId, w18: { matchMethod, confidence, notes } }
 *   400/401/500 on validation, auth, or workflow failures.
 */

const IngestSchema = z.object({
  bankAccountId: z.string().uuid(),
  amount: z.number().refine((v) => v !== 0, 'amount cannot be zero'),
  postedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'postedDate must be YYYY-MM-DD'),
  memo: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  plaidTransactionId: z.string().min(1).optional(),
})

export async function POST(request: Request) {
  const expected = process.env.PLAID_INGEST_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'PLAID_INGEST_SECRET not configured' },
      { status: 500 },
    )
  }
  const provided = request.headers.get('x-ingest-key')
  if (provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = IngestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid payload' },
      { status: 400 },
    )
  }
  const value = parsed.data

  const db = createAdminClient()

  // Resolve the org_id from the bank account (the transaction inherits
  // the same org). Also confirms the account exists before we attempt
  // an insert that would fail on FK anyway — clearer error path.
  const { data: bankAcct, error: acctErr } = await db
    .from('bank_accounts')
    .select('organization_id')
    .eq('id', value.bankAccountId)
    .single()
  if (acctErr || !bankAcct) {
    return NextResponse.json({ error: 'bank_account_not_found' }, { status: 404 })
  }

  // Idempotency: if Plaid retried the webhook, the plaid_transaction_id
  // unique constraint catches it. Fall through to W18 in either case so
  // an earlier failure can be retried by re-sending.
  let bankTransactionId: string
  if (value.plaidTransactionId) {
    const { data: existing } = await db
      .from('bank_transactions')
      .select('id')
      .eq('plaid_transaction_id', value.plaidTransactionId)
      .maybeSingle()
    if (existing) {
      bankTransactionId = existing.id
    } else {
      const inserted = await insertTxn(db, bankAcct.organization_id, value)
      if ('error' in inserted) return inserted.error
      bankTransactionId = inserted.id
    }
  } else {
    const inserted = await insertTxn(db, bankAcct.organization_id, value)
    if ('error' in inserted) return inserted.error
    bankTransactionId = inserted.id
  }

  // Fire W18. The workflow handles its own audit logging via ai_runs.
  try {
    const result = await bankReconciliationAgent.execute(
      { bankTransactionId },
      { organizationId: bankAcct.organization_id },
    )
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
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        bankTransactionId,
        error: err instanceof Error ? err.message : 'workflow_failed',
      },
      { status: 500 },
    )
  }
}

type Db = ReturnType<typeof createAdminClient>

async function insertTxn(
  db: Db,
  organizationId: string,
  input: z.infer<typeof IngestSchema>,
): Promise<{ id: string } | { error: NextResponse }> {
  const { data, error } = await db
    .from('bank_transactions')
    .insert({
      organization_id: organizationId,
      bank_account_id: input.bankAccountId,
      amount: input.amount,
      posted_date: input.postedDate,
      memo: input.memo ?? null,
      merchant: input.merchant ?? null,
      plaid_transaction_id: input.plaidTransactionId ?? null,
    })
    .select('id')
    .single()
  if (error || !data) {
    return {
      error: NextResponse.json(
        { error: `insert_failed: ${error?.message}` },
        { status: 500 },
      ),
    }
  }
  return { id: data.id }
}
