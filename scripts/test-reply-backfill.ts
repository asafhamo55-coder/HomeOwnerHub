/**
 * scripts/test-reply-backfill.ts
 *
 * Verification for Phase B D1/Task 2: the Gmail scope query was widened
 * (packages/mailbox/src/scope.ts, buildScopeQuery) to include the HOA's
 * own sent mail, and migrations/0034a_reset_backfill_for_sent_mail.sql
 * reset every live, fully-backfilled account back to 'pending' so the
 * next connect/re-emit re-imports under the wider query.
 *
 * Three checks:
 *   A1/A2 — buildScopeQuery's output still contains both `from:` (the new
 *     clause) and `to:` (the pre-existing clause), proving the widen was
 *     additive, not a replacement.
 *   A3 — no live (not disconnected) mailbox_accounts row is left at
 *     backfill_status='done' after the migration ran; every one of them
 *     must be 'pending' (or 'running'/'failed' if a re-backfill already
 *     started) so a stale 'done' can't skip the wider re-import.
 *
 * Also reports (informationally, not a pass/fail) how many outbound
 * inbox_messages rows currently exist — expected to be 0 until an actual
 * re-backfill run has processed a mailbox, since this script only resets
 * state and never contacts Gmail.
 *
 * This runs against a LIVE database with the service-role key. It is
 * read-only — no inserts, updates, or deletes — and never logs an email
 * address, subject, or body: only counts and a single non-PII address
 * (a fixed literal, not a real account) used to exercise buildScopeQuery.
 *
 * Run:
 *   rtk npx tsx scripts/test-reply-backfill.ts
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import { buildScopeQuery } from '../packages/mailbox/src/scope'

async function main(): Promise<void> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let pass = 0
  let fail = 0
  const check = (label: string, ok: boolean, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
    ok ? pass++ : fail++
  }

  const q = buildScopeQuery('address', 'someone@example.com')
  check('A1 query includes from:', q.includes('from:someone@example.com'), q)
  check('A2 query still includes to:', q.includes('to:someone@example.com'))

  const accounts = await db
    .from('mailbox_accounts')
    .select('id, backfill_status')
    .is('disconnected_at', null)
  if (accounts.error) {
    throw new Error(`${accounts.error.code} ${accounts.error.message}`)
  }
  check(
    'A3 no live account left at backfill_status=done',
    (accounts.data ?? []).every((a) => a.backfill_status !== 'done'),
    `${accounts.data?.length ?? 0} live account(s)`,
  )

  const msgs = await db.from('inbox_messages').select('direction')
  if (msgs.error) {
    throw new Error(`${msgs.error.code} ${msgs.error.message}`)
  }
  const outbound = (msgs.data ?? []).filter((m) => m.direction === 'outbound').length
  console.log(`\noutbound messages currently stored: ${outbound}`)
  console.log('(0 is expected until a re-backfill actually runs)')

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
