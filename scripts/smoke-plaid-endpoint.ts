/**
 * scripts/smoke-plaid-endpoint.ts
 *
 * Live smoke test of /api/webhooks/plaid. Spins up:
 *   1. A test assessment with memo_code MP-9999-DUES, $123
 *   2. POSTs to /api/webhooks/plaid with a matching synthetic txn
 *   3. Asserts the endpoint returned auto_exact + cleans up
 *
 * Intended to run against a dev server already on port 3010.
 *
 * Run-once script; not part of CI.
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
const INGEST_SECRET = process.env.PLAID_INGEST_SECRET ?? 'dev-ingest-secret-local-only'

const PORT = process.env.HOA_PORT ?? '3010'
const BASE = `http://localhost:${PORT}`

const HARNESS_TAG = 'smoke-plaid'

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('missing supabase env')
  }
  const db = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Find fixture: first HOA association with units + accounting seeded.
  const { data: assocs } = await db
    .from('associations')
    .select('id, slug, organization_id, orgs:organization_id(hub_type)')
  const assoc = (assocs ?? []).find(
    (a) => (a.orgs as { hub_type?: string } | null)?.hub_type === 'hoa',
  )
  if (!assoc) throw new Error('no HOA association')

  const { data: units } = await db
    .from('units')
    .select('id')
    .eq('association_id', assoc.id)
    .limit(1)
  const unit = units?.[0]
  if (!unit) throw new Error('no unit')

  const { data: period } = await db
    .from('fiscal_periods')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('status', 'open')
    .maybeSingle()
  if (!period) throw new Error('no open period')

  // Find or create the harness bank_account.
  const { data: fundOp } = await db
    .from('funds')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('code', 'OPERATING')
    .single()
  if (!fundOp) throw new Error('no OPERATING fund')

  const { data: existingAcct } = await db
    .from('bank_accounts')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('account_name', `${HARNESS_TAG}-bank`)
    .maybeSingle()
  let bankAccountId = existingAcct?.id
  if (!bankAccountId) {
    const { data: created } = await db
      .from('bank_accounts')
      .insert({
        organization_id: assoc.organization_id,
        association_id: assoc.id,
        fund_id: fundOp.id,
        account_name: `${HARNESS_TAG}-bank`,
        bank_name: 'Smoke Bank',
      })
      .select('id')
      .single()
    bankAccountId = created!.id
  }

  // Seed assessment with known memo code.
  const slug = (assoc.slug ?? 'MP').toUpperCase().slice(0, 4)
  const memoCode = `${slug}-9999-DUES`
  const amount = 123

  const { data: assess } = await db
    .from('assessments')
    .insert({
      organization_id: assoc.organization_id,
      association_id: assoc.id,
      unit_id: unit.id,
      fiscal_period_id: period.id,
      assessment_type: 'regular',
      amount,
      due_date: new Date().toISOString().slice(0, 10),
      memo_code: memoCode,
      status: 'open',
    })
    .select('id')
    .single()
  if (!assess) throw new Error('assessment insert failed')

  console.log(`seeded assessment ${assess.id} with memo_code=${memoCode}`)

  // Hit the endpoint.
  const res = await fetch(`${BASE}/api/webhooks/plaid`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ingest-key': INGEST_SECRET,
    },
    body: JSON.stringify({
      bankAccountId,
      amount,
      postedDate: new Date().toISOString().slice(0, 10),
      memo: `ZELLE PAYMENT FROM J SMITH MEMO: ${memoCode}`,
      merchant: null,
      plaidTransactionId: `smoke-${Date.now()}`,
    }),
  })

  const body = await res.json().catch(() => null)
  console.log(`POST /api/webhooks/plaid → ${res.status}`)
  console.log(JSON.stringify(body, null, 2))

  // Assertions.
  let ok = true
  function assertEq(label: string, expected: unknown, actual: unknown): void {
    const pass = JSON.stringify(expected) === JSON.stringify(actual)
    console.log(`  ${pass ? '✓' : '✗'} ${label}: expected=${JSON.stringify(expected)} got=${JSON.stringify(actual)}`)
    if (!pass) ok = false
  }
  assertEq('http 200', 200, res.status)
  assertEq('ok=true', true, body?.ok)
  assertEq('matchMethod=auto_exact', 'auto_exact', body?.w18?.matchMethod)

  // Verify side effects in DB.
  const { data: after } = await db
    .from('assessments')
    .select('status')
    .eq('id', assess.id)
    .single()
  assertEq('assessment paid', 'paid', after?.status)

  // Cleanup.
  if (body?.bankTransactionId) {
    await db.from('bank_transactions').delete().eq('id', body.bankTransactionId)
  }
  const { data: payRows } = await db
    .from('payments')
    .select('id, journal_entry_id')
    .eq('assessment_id', assess.id)
  for (const p of payRows ?? []) {
    if (p.journal_entry_id) {
      await db.from('journal_entries').delete().eq('id', p.journal_entry_id)
    }
  }
  await db.from('payments').delete().eq('assessment_id', assess.id)
  await db.from('assessments').delete().eq('id', assess.id)

  console.log(ok ? '\n✅ smoke pass' : '\n✗ smoke FAILED')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
