/**
 * scripts/backfill-message-direction.ts
 *
 * Repairs `inbox_messages.direction` (and the derived
 * `inbox_threads.last_direction`) for rows ingested before
 * apps/hoa/src/lib/inbox/ingest.ts stopped hardcoding every message
 * 'inbound'.
 *
 * That was correct in Phase A, when the Gmail scope query only ever
 * fetched received mail. Phase B widened `buildScopeQuery` to also match
 * `from:<mailbox address>` so the HOA's own sent replies sync too — but
 * the ingest literal was never updated, so every row landed 'inbound'
 * regardless of who actually sent it. This script recomputes direction
 * the same way ingest.ts now does: `computeDirection(from_email,
 * mailbox_accounts.email_address)` — outbound iff the message's From
 * equals the mailbox's own address, case-insensitively and trimmed; a
 * null From is never a match. See computeDirection's doc comment in
 * ingest.ts for the full rationale (including the send-as-alias
 * limitation this shares).
 *
 * Idempotent — recomputes and compares against the stored value on every
 * row, so a re-run (e.g. after a partial `--apply`, or after new mail
 * ingested correctly in the meantime) only touches rows that are still
 * wrong.
 *
 * DRY RUN BY DEFAULT. Run from repo root (`pnpm exec tsx`, not `npx tsx`,
 * so workspace dependencies resolve):
 *
 *   pnpm exec tsx scripts/backfill-message-direction.ts            # preview
 *   pnpm exec tsx scripts/backfill-message-direction.ts --apply    # write
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import { computeDirection, compareBySentAt } from '../apps/hoa/src/lib/inbox/ingest'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[backfill] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const PAGE_SIZE = 200

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

interface MessageRow {
  id: string
  from_email: string | null
  direction: string
  mailbox_account_id: string
  thread_id: string
}

interface ThreadMessageRow {
  from_email: string | null
  sent_at: string | null
}

async function loadMailboxAddresses(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  // Small table (one row per connected mailbox) — a single unpaginated
  // read is fine, and it's only ever used in-memory for comparison, never
  // logged.
  const { data, error } = await db.from('mailbox_accounts').select('id, email_address')
  if (error) {
    console.error('[backfill] failed to load mailbox_accounts:', error.message)
    process.exit(1)
  }
  for (const row of data ?? []) map.set(row.id, row.email_address)
  return map
}

/**
 * Re-derive a thread's `last_direction` from its current messages —
 * mirrors ingestThread's activity-field logic in ingest.ts (newest by
 * `compareBySentAt`, i.e. ascending sentAt with null sorted last so an
 * undated message wins "newest" rather than being masked as oldest).
 * Returns null if the thread has no messages (should not happen, but a
 * script must not assume its inputs) or if the correct direction already
 * matches what is stored.
 */
async function recomputeThreadDirection(
  threadId: string,
  storedLastDirection: string | null,
  mailboxAddresses: Map<string, string>,
  threadMailboxAccountId: string,
): Promise<'inbound' | 'outbound' | null> {
  const { data, error } = await db
    .from('inbox_messages')
    .select('from_email, sent_at')
    .eq('thread_id', threadId)

  if (error) {
    console.error(`[backfill] failed to load messages for thread ${threadId}:`, error.message)
    return null
  }

  const rows = (data ?? []) as ThreadMessageRow[]
  if (rows.length === 0) return null

  const mailboxAddress = mailboxAddresses.get(threadMailboxAccountId)
  if (!mailboxAddress) {
    console.error(
      `[backfill] thread ${threadId}: no mailbox_accounts row for ${threadMailboxAccountId} — skipping`,
    )
    return null
  }

  // compareBySentAt is typed against `{ sentAt }` (ingest.ts's ParsedMessage
  // shape), not the DB's `sent_at` column name — map before sorting.
  const newest = [...rows]
    .map((row) => ({ sentAt: row.sent_at, fromEmail: row.from_email }))
    .sort(compareBySentAt)[rows.length - 1]
  const correct = computeDirection(newest.fromEmail, mailboxAddress)
  return correct === storedLastDirection ? null : correct
}

async function main(): Promise<void> {
  console.log(`[backfill] mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`)

  const mailboxAddresses = await loadMailboxAddresses()

  let scanned = 0
  let wouldFlipToOutbound = 0
  let wouldFlipToInbound = 0
  let skippedUnknownMailbox = 0
  const affectedThreadIds = new Set<string>()

  // Page by id, not offset: under --apply a row's `direction` changes as
  // we go, and any filter derived from that (or a fixed-offset page)
  // would skip or re-visit rows. An ascending id cursor is immune to
  // that regardless of what changes underneath it.
  let afterId = '00000000-0000-0000-0000-000000000000'

  for (;;) {
    const { data, error } = await db
      .from('inbox_messages')
      .select('id, from_email, direction, mailbox_account_id, thread_id')
      .gt('id', afterId)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (error) {
      console.error('[backfill] read failed:', error.message)
      process.exit(1)
    }
    const rows = (data ?? []) as MessageRow[]
    if (rows.length === 0) break

    for (const row of rows) {
      scanned++
      afterId = row.id

      const mailboxAddress = mailboxAddresses.get(row.mailbox_account_id)
      if (!mailboxAddress) {
        skippedUnknownMailbox++
        console.error(
          `[backfill] message ${row.id}: no mailbox_accounts row for ${row.mailbox_account_id} — skipping`,
        )
        continue
      }

      const correct = computeDirection(row.from_email, mailboxAddress)
      if (correct === row.direction) continue

      if (correct === 'outbound') wouldFlipToOutbound++
      else wouldFlipToInbound++
      affectedThreadIds.add(row.thread_id)

      if (!APPLY) {
        // Id and the two direction values only — no address, subject, or
        // body. A dry run is exactly when someone pipes this to a file
        // and forgets it.
        console.log(`[dry-run] message ${row.id}: ${row.direction} -> ${correct}`)
        continue
      }

      const { error: writeError } = await db
        .from('inbox_messages')
        .update({ direction: correct })
        .eq('id', row.id)

      if (writeError) {
        // One bad row must not abandon the rest. The script is
        // idempotent — re-run to retry whatever failed.
        console.error(`[backfill] update failed for message ${row.id}:`, writeError.message)
      }
    }
  }

  // ── thread last_direction, recomputed for every thread that had at
  // least one message direction change ────────────────────────────────
  let threadDirectionChanges = 0
  for (const threadId of affectedThreadIds) {
    const { data: threadRow, error: threadError } = await db
      .from('inbox_threads')
      .select('id, mailbox_account_id, last_direction')
      .eq('id', threadId)
      .maybeSingle()

    if (threadError || !threadRow) {
      console.error(
        `[backfill] failed to load thread ${threadId}:`,
        threadError?.message ?? 'not found',
      )
      continue
    }

    const correct = await recomputeThreadDirection(
      threadId,
      threadRow.last_direction,
      mailboxAddresses,
      threadRow.mailbox_account_id,
    )
    if (correct === null) continue

    threadDirectionChanges++

    if (!APPLY) {
      console.log(`[dry-run] thread ${threadId}: ${threadRow.last_direction} -> ${correct}`)
      continue
    }

    const { error: writeError } = await db
      .from('inbox_threads')
      .update({ last_direction: correct })
      .eq('id', threadId)

    if (writeError) {
      console.error(`[backfill] update failed for thread ${threadId}:`, writeError.message)
    }
  }

  console.log(
    `[backfill] scanned ${scanned} message(s) · ` +
      `${APPLY ? 'flipped' : 'would flip'} to outbound: ${wouldFlipToOutbound} · ` +
      `${APPLY ? 'flipped' : 'would flip'} to inbound: ${wouldFlipToInbound} · ` +
      `skipped (unknown mailbox): ${skippedUnknownMailbox} · ` +
      `thread(s) whose last_direction ${APPLY ? 'changed' : 'would change'}: ${threadDirectionChanges}`,
  )
  if (!APPLY && (wouldFlipToOutbound > 0 || wouldFlipToInbound > 0)) {
    console.log('[backfill] re-run with --apply to write these changes')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
