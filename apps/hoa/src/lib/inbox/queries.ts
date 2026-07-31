/**
 * Read queries for the Settings → Mailbox page.
 *
 * `getConnectPreview` is the self-verifying panel shown right after
 * connecting. This is where a tenant catches a bad matcher BEFORE it
 * misfiles sixty emails — so the sample deliberately shows what each
 * message resolved to, not just a count.
 *
 * Note: this module does NOT `import 'server-only'`. That package is not
 * a dependency anywhere in this repo (checked package.json + the lockfile)
 * and adding it here without installing it would fail the build. Every
 * export below still only runs where it's called from — the mailbox
 * settings page (a Server Component) — so nothing here is at risk of
 * being pulled into a client bundle in practice.
 *
 * Error handling: every Supabase read below destructures `error` and
 * checks it explicitly. A soft PostgREST failure returns `{ data: null,
 * error }` WITHOUT throwing, so an unchecked read would silently look
 * like "no rows" — the recurring defect this codebase has hit in six
 * other modules. Matches the pattern in apps/hoa/src/lib/inbox/ingest.ts:
 * queries whose failure would make the page lie about connection state
 * (the account row itself, the preview totals) throw; queries that only
 * enrich one row of the sample (a sender lookup, a unit lookup) log and
 * degrade that single row to "unknown" rather than failing the whole
 * preview.
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'

type Db = SupabaseClient<Database>

export interface MailboxStatus {
  id: string
  emailAddress: string
  scopeMode: 'address' | 'label' | 'all'
  scopeValue: string | null
  syncStatus: 'ok' | 'stalled' | 'auth_failed'
  syncError: string | null
  lastSyncedAt: string | null
  backfillStatus: 'pending' | 'running' | 'done' | 'failed'
  backfillDone: number
  /**
   * Gmail's `resultSizeEstimate` from the first backfill page — an
   * ESTIMATE, not an exact count. `backfillDone` can end up greater than
   * this (see packages/jobs/src/mailbox-backfill.ts). Null until the
   * first backfill page has run.
   */
  backfillTotalEstimate: number | null
}

export interface ConnectPreviewRow {
  fromEmail: string | null
  subject: string | null
  matchedAddress: string | null
  confidence: string
}

export interface ConnectPreview {
  totalMessages: number
  matchedThreads: number
  needsReviewThreads: number
  sample: ConnectPreviewRow[]
}

function logDbError(
  fn: string,
  table: string,
  context: Record<string, string | null>,
  error: PostgrestError,
): void {
  console.error(`${fn}: query on "${table}" failed`, {
    ...context,
    code: error.code,
    message: error.message,
  })
}

export async function getMailboxStatus(
  db: Db,
  orgId: string,
): Promise<MailboxStatus | null> {
  const { data, error } = await db
    .from('mailbox_accounts')
    .select(
      'id, email_address, scope_mode, scope_value, sync_status, sync_error, last_synced_at, backfill_status, backfill_progress',
    )
    .eq('organization_id', orgId)
    .is('disconnected_at', null)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logDbError('getMailboxStatus', 'mailbox_accounts', { orgId }, error)
    throw new Error(`getMailboxStatus: failed to load mailbox account: ${error.message}`)
  }
  if (!data) return null

  const progress = (data.backfill_progress ?? {}) as {
    done?: number
    total_estimate?: number
  }

  return {
    id: data.id,
    emailAddress: data.email_address,
    scopeMode: data.scope_mode as MailboxStatus['scopeMode'],
    scopeValue: data.scope_value,
    syncStatus: data.sync_status as MailboxStatus['syncStatus'],
    syncError: data.sync_error,
    lastSyncedAt: data.last_synced_at,
    backfillStatus: data.backfill_status as MailboxStatus['backfillStatus'],
    backfillDone: progress.done ?? 0,
    backfillTotalEstimate:
      typeof progress.total_estimate === 'number' ? progress.total_estimate : null,
  }
}

/**
 * The self-verifying panel shown right after connecting.
 *
 * This is where a tenant catches a bad matcher BEFORE it misfiles sixty
 * emails — so the sample deliberately shows what each message resolved
 * to, not just a count.
 */
export async function getConnectPreview(
  db: Db,
  orgId: string,
  accountId: string,
): Promise<ConnectPreview> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { count: totalMessages, error: countError } = await db
    .from('inbox_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('sent_at', thirtyDaysAgo)

  if (countError) {
    logDbError('getConnectPreview', 'inbox_messages', { orgId, accountId }, countError)
    throw new Error(
      `getConnectPreview: failed to count recent messages: ${countError.message}`,
    )
  }

  const { data: threads, error: threadsError } = await db
    .from('inbox_threads')
    .select('id, subject, unit_id, match_confidence, status, last_message_at')
    .eq('mailbox_account_id', accountId)
    .gte('last_message_at', thirtyDaysAgo)
    .order('last_message_at', { ascending: false })

  if (threadsError) {
    logDbError('getConnectPreview', 'inbox_threads', { orgId, accountId }, threadsError)
    throw new Error(
      `getConnectPreview: failed to load recent threads: ${threadsError.message}`,
    )
  }

  const all = threads ?? []
  const matched = all.filter((t) => t.unit_id !== null)
  const needsReview = all.filter((t) => t.status === 'needs_review')

  // Build a mixed sample — some matched, some not — so the preview shows
  // both outcomes rather than only the flattering one.
  const sampleThreads = [...matched.slice(0, 2), ...needsReview.slice(0, 1)].slice(0, 3)

  const sample: ConnectPreviewRow[] = []
  for (const thread of sampleThreads) {
    const { data: message, error: messageError } = await db
      .from('inbox_messages')
      .select('from_email')
      .eq('thread_id', thread.id)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    // Enrichment only — a failure here degrades this one sample row to
    // "unknown sender" rather than aborting the whole preview, the same
    // stakes-based split ingest.ts uses between thread/message failures
    // (throw) and attachment failures (log + continue).
    if (messageError) {
      logDbError(
        'getConnectPreview',
        'inbox_messages',
        { orgId, accountId, threadId: thread.id },
        messageError,
      )
    }

    let matchedAddress: string | null = null
    if (thread.unit_id) {
      const { data: unit, error: unitError } = await db
        .from('units')
        .select('address_line1')
        .eq('id', thread.unit_id)
        .maybeSingle()

      if (unitError) {
        logDbError(
          'getConnectPreview',
          'units',
          { orgId, accountId, unitId: thread.unit_id },
          unitError,
        )
      }
      matchedAddress = unit?.address_line1 ?? null
    }

    sample.push({
      fromEmail: messageError ? null : message?.from_email ?? null,
      subject: thread.subject,
      matchedAddress,
      confidence: thread.match_confidence,
    })
  }

  return {
    totalMessages: totalMessages ?? 0,
    matchedThreads: matched.length,
    needsReviewThreads: needsReview.length,
    sample,
  }
}
