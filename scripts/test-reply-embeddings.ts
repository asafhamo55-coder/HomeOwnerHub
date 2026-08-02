/**
 * scripts/test-reply-embeddings.ts
 *
 * Proves the one mechanism mailboxReplyEmbeddingsJob depends on entirely:
 * that a message which already has a row in inbox_reply_embeddings stops
 * being a candidate on the next run.
 *
 * Why this needs a live test rather than a unit test: the candidate query
 * uses a PostgREST embedded-resource filter —
 *
 *     .select('id, ..., inbox_reply_embeddings(message_id)')
 *     .is('inbox_reply_embeddings', null)
 *
 * — to express NOT EXISTS, which PostgREST has no direct syntax for. Whether
 * that is a genuine anti-join, a silent no-op returning everything, or a
 * rejected filter is a property of the PostgREST layer against this specific
 * schema. It cannot be established by reading the code, and mocking it would
 * only test the mock.
 *
 * The stakes are why this exists as a permanent check. If the filter is a
 * no-op, every already-embedded message is re-selected and re-embedded on
 * every 10-minute cron run, forever, against a paid API — and nothing
 * reports it, because the job's own counters would look healthy.
 *
 * A previous review cycle flagged this mechanism twice as the load-bearing
 * risk. It had been asserted from a probe that could not actually
 * distinguish the cases: inbox_reply_embeddings was empty, so every message
 * trivially had no embedding and "returns rows" proved nothing about
 * exclusion. This test creates the missing condition explicitly.
 *
 * SAFETY: runs against the LIVE database with the service-role key. It
 * aborts if inbox_reply_embeddings is not empty, touches only the single row
 * it creates, always deletes it (including on failure), and verifies the
 * table is empty again afterwards. It logs message ids and counts only —
 * never an address, subject, or body.
 *
 * Run:
 *   npx tsx scripts/test-reply-embeddings.ts
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'

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

  // Refuse to run if the table already holds data — this test asserts on
  // exact candidate counts, and it must never delete a row it did not create.
  const pre = await db.from('inbox_reply_embeddings').select('id')
  if (pre.error) throw new Error(`preflight: ${pre.error.code} ${pre.error.message}`)
  if ((pre.data ?? []).length !== 0) {
    throw new Error(
      `ABORT: inbox_reply_embeddings holds ${pre.data!.length} row(s). ` +
        'This test only runs against an empty table so it cannot disturb real data.',
    )
  }

  // Probe against inbound messages: the job itself filters to outbound, but
  // the anti-join semantics under test are identical, and inbound is the
  // populated set today. Using an empty set would make every outcome look
  // the same — which is exactly the mistake this test was written to correct.
  const msgs = await db
    .from('inbox_messages')
    .select('id, organization_id')
    .eq('direction', 'inbound')
    .limit(2)
  if (msgs.error) throw new Error(`messages: ${msgs.error.code} ${msgs.error.message}`)

  const [target, control] = msgs.data ?? []
  if (!target || !control) {
    throw new Error('Need at least 2 inbound messages to run this test.')
  }

  const candidates = async (): Promise<string[]> => {
    const q = await db
      .from('inbox_messages')
      .select('id, inbox_reply_embeddings(message_id)')
      .eq('direction', 'inbound')
      .is('inbox_reply_embeddings', null)
      .limit(1000)
    if (q.error) throw new Error(`candidate query: ${q.error.code} ${q.error.message}`)
    return (q.data ?? []).map((r) => r.id)
  }

  const before = await candidates()
  check(
    'C1 a message with no embedding row is a candidate',
    before.includes(target.id),
    `${before.length} candidates`,
  )

  // A marker row: NULL embedding + skip_reason, the shape the job writes for
  // a reply too short to teach anything about voice (migration 0034c). If
  // markers did not suppress candidacy, short replies would refill every
  // batch forever and the corpus would stay silently empty.
  const inserted = await db
    .from('inbox_reply_embeddings')
    .insert({
      organization_id: target.organization_id,
      message_id: target.id,
      embedding: null,
      text_sha256: 'verification-probe',
      skip_reason: 'verification_probe',
    })
    .select('id')
    .single()
  if (inserted.error) {
    throw new Error(`insert probe row: ${inserted.error.code} ${inserted.error.message}`)
  }

  try {
    const after = await candidates()
    check(
      'C2 the same message is EXCLUDED once a marker row exists',
      !after.includes(target.id),
      `${after.length} candidates`,
    )
    check('C3 an untouched message is still a candidate', after.includes(control.id))
    check(
      'C4 exactly one message left the candidate set',
      before.length - after.length === 1,
      `${before.length} -> ${after.length}`,
    )
  } finally {
    // Always runs, including when an assertion above throws.
    const deleted = await db
      .from('inbox_reply_embeddings')
      .delete()
      .eq('id', inserted.data.id)
      .select('id')
    if (deleted.error) {
      throw new Error(
        `CLEANUP FAILED — probe row ${inserted.data.id} may remain: ` +
          `${deleted.error.code} ${deleted.error.message}`,
      )
    }
    const post = await db.from('inbox_reply_embeddings').select('id')
    if (post.error) throw new Error(`cleanup verify: ${post.error.code} ${post.error.message}`)
    console.log(
      `cleanup: removed ${deleted.data?.length ?? 0} probe row(s), table now holds ${
        post.data?.length ?? 0
      }`,
    )
  }

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
