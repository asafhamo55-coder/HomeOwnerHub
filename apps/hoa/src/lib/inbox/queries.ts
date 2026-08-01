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
  /**
   * Thread count, not message count — deliberately the same unit as
   * `matchedThreads`/`needsReviewThreads` below. A single thread can
   * contain several messages, so mixing a message count in here would
   * make "X total / Y matched / Z need review" fail to reconcile for
   * anyone reading the panel.
   */
  totalThreads: number
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
    totalThreads: all.length,
    matchedThreads: matched.length,
    needsReviewThreads: needsReview.length,
    sample,
  }
}

export interface SetupStep {
  key: 'hoa_details' | 'mailbox' | 'properties' | 'board_members'
  title: string
  description: string
  done: boolean
  href: string
  cta: string
}

/**
 * Drives the onboarding checklist and the dashboard nudge.
 *
 * Completion is DERIVED from real data, never stored as a flag. A stored
 * "onboarding complete" boolean drifts the moment someone deletes their
 * last property, and then the checklist lies.
 *
 * The two `head: true` counts below decide whether a step renders as done
 * or not-done, so — same stakes-based split as the rest of this module —
 * a failed count must not be mistaken for a zero count. Both destructure
 * `error` and throw rather than falling through to `count ?? 0`, which
 * would silently render an incomplete step as done or an already-done
 * step as still pending.
 */
export async function getSetupProgress(db: Db, orgId: string): Promise<SetupStep[]> {
  const [mailbox, propertiesResult, membersResult] = await Promise.all([
    getMailboxStatus(db, orgId),
    db
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    db
      .from('org_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', orgId),
  ])

  const { count: propertiesCount, error: propertiesError } = propertiesResult
  if (propertiesError) {
    logDbError('getSetupProgress', 'units', { orgId }, propertiesError)
    throw new Error(`getSetupProgress: failed to count properties: ${propertiesError.message}`)
  }

  const { count: membersCount, error: membersError } = membersResult
  if (membersError) {
    logDbError('getSetupProgress', 'org_members', { orgId }, membersError)
    throw new Error(`getSetupProgress: failed to count board members: ${membersError.message}`)
  }

  return [
    {
      key: 'hoa_details',
      title: 'HOA details',
      description: 'Name and size of your community.',
      done: true, // guaranteed — the org exists
      href: '/settings',
      cta: 'Edit',
    },
    {
      key: 'mailbox',
      title: 'Connect your HOA mailbox',
      description: 'Resident emails flow in automatically, matched to properties.',
      done: mailbox !== null,
      href: '/onboarding/setup',
      cta: 'Connect Google',
    },
    {
      key: 'properties',
      title: 'Import properties',
      description: 'Addresses and owners, so email can be matched to a home.',
      done: (propertiesCount ?? 0) > 0,
      href: '/admin/import-units',
      cta: 'Upload CSV',
    },
    {
      key: 'board_members',
      title: 'Invite board members',
      description: 'Give the rest of the board access.',
      done: (membersCount ?? 0) > 1,
      href: '/settings/members',
      cta: 'Invite',
    },
  ]
}

// ─── Inbox list (Task 20) ───────────────────────────────────────────────

export type InboxFilter = 'needs_review' | 'open' | 'waiting' | 'closed' | 'all'

export interface ThreadListItem {
  id: string
  subject: string | null
  fromName: string | null
  fromEmail: string | null
  snippet: string | null
  lastMessageAt: string | null
  unitId: string | null
  propertyAddress: string | null
  matchConfidence: string
  status: string
  hasAttachments: boolean
}

/**
 * Backs the filter-chip counts on the inbox list. A miscount here is not
 * cosmetic: if the "needs_review" count silently fell back to 0 on a
 * failed query, a manager would read that as "nothing to do" and skip the
 * queue entirely — the same failure mode `error` handling in this module
 * exists to prevent everywhere else, so each per-status count throws
 * rather than defaulting.
 */
export async function countThreadsByStatus(
  db: Db,
  orgId: string,
): Promise<Record<InboxFilter, number>> {
  const statuses: Array<Exclude<InboxFilter, 'all'>> = [
    'needs_review',
    'open',
    'waiting',
    'closed',
  ]

  const counts = await Promise.all(
    statuses.map((status) =>
      db
        .from('inbox_threads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', status),
    ),
  )

  const result = {} as Record<InboxFilter, number>
  statuses.forEach((status, index) => {
    const { count, error } = counts[index]
    if (error) {
      logDbError('countThreadsByStatus', 'inbox_threads', { orgId, status }, error)
      throw new Error(`countThreadsByStatus: failed to count "${status}" threads: ${error.message}`)
    }
    result[status] = count ?? 0
  })
  result.all = statuses.reduce((sum, status) => sum + result[status], 0)
  return result
}

/**
 * The inbox list itself. The main thread query is list-defining — a
 * swallowed error here would render an empty inbox indistinguishable
 * from a quiet week, so it throws. The three batched lookups below
 * (messages, units, attachment flags) only enrich rows that already
 * exist; a failure in one degrades those fields to "unknown" for this
 * page rather than hiding the whole list, matching the stakes split in
 * getConnectPreview above.
 */
export async function listThreads(
  db: Db,
  orgId: string,
  filter: InboxFilter,
  limit = 50,
): Promise<ThreadListItem[]> {
  let query = db
    .from('inbox_threads')
    .select('id, subject, unit_id, match_confidence, status, last_message_at')
    .eq('organization_id', orgId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (filter !== 'all') query = query.eq('status', filter)

  const { data: threads, error: threadsError } = await query
  if (threadsError) {
    logDbError('listThreads', 'inbox_threads', { orgId, filter }, threadsError)
    throw new Error(`listThreads: failed to load threads: ${threadsError.message}`)
  }
  if (!threads || threads.length === 0) return []

  const threadIds = threads.map((t) => t.id)
  const unitIds = threads.map((t) => t.unit_id).filter((id): id is string => id !== null)

  // Batch the lookups rather than querying per row — a 50-thread page
  // would otherwise fire 150 round-trips.
  const [messagesResult, unitsResult, attachmentsResult] = await Promise.all([
    db
      .from('inbox_messages')
      .select('thread_id, from_name, from_email, stripped_text, sent_at')
      .in('thread_id', threadIds)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false }),
    unitIds.length > 0
      ? db.from('units').select('id, address_line1').in('id', unitIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; address_line1: string }>,
          error: null,
        }),
    db
      .from('inbox_attachments')
      .select('thread_id')
      .in('thread_id', threadIds)
      .neq('fetch_status', 'skipped'),
  ])

  const { data: messages, error: messagesError } = messagesResult
  if (messagesError) {
    logDbError('listThreads', 'inbox_messages', { orgId, filter }, messagesError)
  }

  const { data: units, error: unitsError } = unitsResult
  if (unitsError) {
    logDbError('listThreads', 'units', { orgId, filter }, unitsError)
  }

  const { data: attachments, error: attachmentsError } = attachmentsResult
  if (attachmentsError) {
    logDbError('listThreads', 'inbox_attachments', { orgId, filter }, attachmentsError)
  }

  const newestByThread = new Map<string, NonNullable<typeof messages>[number]>()
  for (const message of messages ?? []) {
    if (!newestByThread.has(message.thread_id)) newestByThread.set(message.thread_id, message)
  }
  const addressByUnit = new Map((units ?? []).map((u) => [u.id, u.address_line1]))
  const threadsWithFiles = new Set((attachments ?? []).map((a) => a.thread_id))

  return threads.map((thread) => {
    const newest = newestByThread.get(thread.id)
    return {
      id: thread.id,
      subject: thread.subject,
      fromName: newest?.from_name ?? null,
      fromEmail: newest?.from_email ?? null,
      snippet: newest?.stripped_text?.slice(0, 140) ?? null,
      lastMessageAt: thread.last_message_at,
      unitId: thread.unit_id,
      propertyAddress: thread.unit_id ? addressByUnit.get(thread.unit_id) ?? null : null,
      matchConfidence: thread.match_confidence,
      status: thread.status,
      hasAttachments: threadsWithFiles.has(thread.id),
    }
  })
}
