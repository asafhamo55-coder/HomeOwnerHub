/**
 * scripts/test-mailbox-sync.ts
 *
 * Proves the property the whole sync design rests on: ingesting the same
 * messages twice changes nothing. A historyId expiry fallback, an Inngest
 * retry, and an overlapping cron run all re-deliver mail we already have —
 * every one of those paths must be a no-op. And a manager's manual triage
 * decision (`match_source = 'manual'`) must survive new mail arriving on
 * that thread; ingest.ts only ever touches a thread's activity fields
 * (subject, participants, last_message_at, last_direction), never
 * unit_id/status/match_*.
 *
 * Covers:
 *   A-D. first ingest: 2 threads, 3 messages, invoices queued, inline
 *        signature logos (isInline + <=100KB) marked 'skipped' not stored.
 *   E-J. second ingest of the IDENTICAL batch: zero new threads, zero new
 *        messages, zero new/duplicate attachment rows, unchanged totals.
 *   K.   a manual assignment on a thread survives a new message landing
 *        on that same thread.
 *
 * Run:
 *   rtk proxy pnpm exec tsx scripts/test-mailbox-sync.ts
 *
 * Credential resolution deviates from a naive `process.env.X` check, same
 * pattern as scripts/test-inbox-rls.ts and scripts/test-inbox-match.ts:
 * Vercel writes empty-string placeholders for Sensitive env vars it can't
 * decrypt locally, so an empty string is treated the same as unset.
 * Fallback order (first non-empty wins):
 *   URL:     NEXT_PUBLIC_SUPABASE_URL → SUPABASE_URL
 *   service: SUPABASE_SERVICE_ROLE_KEY → SUPABASE_SECRET_KEY
 *
 * This runs against a LIVE database. Every row created is tagged with TAG
 * so it is findable, cleanup runs even if an assertion throws (wrapped in
 * try/finally), and a tag-scoped preflight sweep removes anything a prior
 * interrupted run left behind. Never touches org
 * a4906f16-baf3-4232-a2bd-a78ea432ad86 (Madison Park, a live tenant) or any
 * row this script did not create. Never logs an email address, subject, or
 * body — only ids and counts.
 *
 * Follows the skip-counter pattern in scripts/test-inbox-rls.ts: a skipped
 * check prints a distinct SKIP line and is never counted as a pass — any
 * skip makes the run exit non-zero.
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import type { ParsedMessage } from '../packages/mailbox/src/types'
import { ingestMessages } from '../apps/hoa/src/lib/inbox/ingest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!url || !key) {
  console.error(
    'Need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and ' +
      'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)',
  )
  process.exit(1)
}

const db = createClient<Database>(url, key)
const TAG = 'test-mailbox-sync-harness'

let failures = 0
let skipped = 0

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

function skip(name: string, reason: string): void {
  console.log(`SKIP  ${name} — ${reason}`)
  skipped++
}

/**
 * Preflight sweep — finds and deletes anything a previous run left behind
 * (SIGKILL, OOM, or a network drop during that run's own `finally` block
 * would leave a harness org and its cascaded children live in this
 * database with no record of their ids). Strictly tag-scoped: orgs matched
 * by `name ilike '%' || TAG || '%'`. Never a broad delete.
 */
async function sweepPreviousRuns(): Promise<void> {
  const { data: staleOrgs, error } = await db.from('orgs').select('id, name').ilike('name', `%${TAG}%`)

  if (error) {
    console.error(`Preflight sweep: could not query for stale orgs — ${error.message}`)
    return
  }

  if (staleOrgs && staleOrgs.length > 0) {
    const staleIds = staleOrgs.map((o) => o.id)
    const { error: deleteErr } = await db.from('orgs').delete().in('id', staleIds)
    if (deleteErr) {
      console.error(`Preflight sweep: could not delete stale orgs — ${deleteErr.message}`)
    } else {
      console.log(`Preflight sweep: removed ${staleOrgs.length} stale org(s) from a previous run.`)
    }
  } else {
    console.log('Preflight sweep: no stale orgs found.')
  }
  console.log('')
}

/**
 * Every message carries one real attachment (a PDF invoice — NOT inline,
 * always queued) and one small inline attachment (a signature logo GIF —
 * always skipped). File names differ from the gmail attachment id (which
 * is what actually feeds the generated `gmail_attachment_key` column), so
 * the per-message unique index on inbox_attachments never collides across
 * distinct messages.
 */
function message(id: string, threadId: string): ParsedMessage {
  return {
    gmailMessageId: `${TAG}-${id}`,
    gmailThreadId: `${TAG}-${threadId}`,
    rfc822MessageId: `<${TAG}-${id}@mail.test>`,
    inReplyTo: null,
    references: [],
    fromEmail: `sender+${TAG}@example.test`,
    fromName: 'Harness Sender',
    toEmails: [`board+${TAG}@example.test`],
    ccEmails: [],
    deliveredTo: [],
    subject: `${TAG} subject ${id}`,
    bodyText: 'harness body',
    bodyHtml: null,
    strippedText: 'harness body',
    attachments: [
      {
        gmailAttachmentId: `${TAG}-att-${id}`,
        fileName: 'invoice.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        isInline: false,
      },
      {
        gmailAttachmentId: `${TAG}-logo-${id}`,
        fileName: 'logo.gif',
        contentType: 'image/gif',
        sizeBytes: 4096,
        isInline: true,
      },
    ],
    sentAt: new Date().toISOString(),
    labelIds: ['INBOX'],
  }
}

async function main(): Promise<void> {
  await sweepPreviousRuns()

  const { data: org, error: orgError } = await db
    .from('orgs')
    .insert({ name: `${TAG}-org`, hub_type: 'hoa' })
    .select('id')
    .single()
  if (orgError || !org) {
    console.error(`Could not seed org: ${orgError?.message}`)
    process.exit(1)
  }

  console.log(`Seeded org: ${org.id}\n`)

  try {
    const { data: account, error: accountError } = await db
      .from('mailbox_accounts')
      .insert({
        organization_id: org.id,
        email_address: `board+${TAG}@example.test`,
        scope_mode: 'all',
      })
      .select('id')
      .single()
    if (accountError || !account) {
      throw new Error(`Could not seed mailbox_accounts: ${accountError?.message}`)
    }

    // Two threads: t1 (m1, m2), t2 (m3).
    const batch = [message('m1', 't1'), message('m2', 't1'), message('m3', 't2')]

    // ── first ingest ───────────────────────────────────────────────────
    const first = await ingestMessages(db, org.id, account.id, batch)

    check('A. first ingest creates 2 threads', first.threadsCreated === 2, `${first.threadsCreated}`)
    check('B. first ingest inserts 3 messages', first.messagesInserted === 3, `${first.messagesInserted}`)
    check(
      'C. inline logo skipped, invoice queued (3 queued, not 6)',
      first.attachmentsQueued === 3,
      `${first.attachmentsQueued}`,
    )
    check(
      'C2. first ingest reports zero failures',
      first.threadsFailed === 0 && first.messagesFailed === 0 && first.attachmentsFailed === 0,
      `threadsFailed=${first.threadsFailed} messagesFailed=${first.messagesFailed} attachmentsFailed=${first.attachmentsFailed}`,
    )

    const { count: skippedAttachments } = await db
      .from('inbox_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('fetch_status', 'skipped')
    check('D. 3 inline images marked skipped, not stored', skippedAttachments === 3, `${skippedAttachments}`)

    const { count: totalAttachmentsAfterFirst } = await db
      .from('inbox_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
    check(
      'D2. 6 total attachment rows after first ingest (3 invoices + 3 logos)',
      totalAttachmentsAfterFirst === 6,
      `${totalAttachmentsAfterFirst}`,
    )

    // ── second ingest, identical input ──────────────────────────────────
    const second = await ingestMessages(db, org.id, account.id, batch)

    check('E. re-ingest creates NO new threads', second.threadsCreated === 0, `${second.threadsCreated}`)
    check('F. re-ingest inserts NO new messages', second.messagesInserted === 0, `${second.messagesInserted}`)
    check('G. re-ingest skips all 3 as duplicates', second.messagesSkipped === 3, `${second.messagesSkipped}`)
    check(
      'G2. re-ingest queues NO new attachments (repair path is a no-op here)',
      second.attachmentsQueued === 0,
      `${second.attachmentsQueued}`,
    )
    check(
      'G3. re-ingest reports zero failures',
      second.threadsFailed === 0 && second.messagesFailed === 0 && second.attachmentsFailed === 0,
      `threadsFailed=${second.threadsFailed} messagesFailed=${second.messagesFailed} attachmentsFailed=${second.attachmentsFailed}`,
    )

    const { count: totalMessages } = await db
      .from('inbox_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
    check('H. still exactly 3 messages in the database', totalMessages === 3, `${totalMessages}`)

    const { count: totalAttachmentsAfterSecond } = await db
      .from('inbox_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
    check(
      'I. still exactly 6 attachment rows — zero duplicates from the re-ingest',
      totalAttachmentsAfterSecond === 6,
      `${totalAttachmentsAfterSecond}`,
    )

    const { count: totalThreads } = await db
      .from('inbox_threads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
    check('J. still exactly 2 threads in the database', totalThreads === 2, `${totalThreads}`)

    // ── manual assignment survives new mail ──────────────────────────────
    const { data: thread, error: threadFetchError } = await db
      .from('inbox_threads')
      .select('id')
      .eq('mailbox_account_id', account.id)
      .eq('gmail_thread_id', `${TAG}-t1`)
      .single()
    if (threadFetchError || !thread) {
      throw new Error(`Could not fetch thread t1: ${threadFetchError?.message}`)
    }

    const { error: manualAssignError } = await db
      .from('inbox_threads')
      .update({ match_source: 'manual', status: 'open', match_confidence: 'high' })
      .eq('id', thread.id)
    if (manualAssignError) {
      throw new Error(`Could not set manual assignment: ${manualAssignError.message}`)
    }

    const third = await ingestMessages(db, org.id, account.id, [message('m4', 't1')])
    check('K1. new mail on the thread still ingests (1 message inserted)', third.messagesInserted === 1, `${third.messagesInserted}`)

    const { data: after, error: afterError } = await db
      .from('inbox_threads')
      .select('match_source, status, match_confidence')
      .eq('id', thread.id)
      .single()
    if (afterError) {
      throw new Error(`Could not re-fetch thread t1 after new mail: ${afterError.message}`)
    }
    check(
      'K2. new mail does not clobber a manual assignment',
      after?.match_source === 'manual' && after?.status === 'open' && after?.match_confidence === 'high',
      `${after?.match_source}/${after?.status}/${after?.match_confidence}`,
    )
  } catch (err) {
    console.error('\nUnexpected error during test body:', err instanceof Error ? err.message : err)
    failures++
  } finally {
    // ── cleanup (cascades handle children: mailbox_accounts, inbox_threads,
    // inbox_messages, inbox_attachments all FK to orgs/threads/messages
    // ON DELETE CASCADE) ────────────────────────────────────────────────
    const { error: cleanupErr } = await db.from('orgs').delete().eq('id', org.id)
    if (cleanupErr) {
      check('Z. cleanup deleted the harness org', false, cleanupErr.message)
    } else {
      check('Z. cleanup deleted the harness org', true)
    }

    const { data: leftoverOrgs } = await db.from('orgs').select('id').eq('id', org.id)
    check('Za. no harness org remains', (leftoverOrgs ?? []).length === 0)
  }

  if (skipped > 0) {
    console.log(`\n${skipped} CHECK(S) COULD NOT RUN — RESULT IS NOT A PASS`)
    process.exit(1)
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
