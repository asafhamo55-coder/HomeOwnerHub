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
 *
 * Org scoping (amended post-review, Task 21 finding 1 — see
 * `.superpowers/sdd/task-21-report.md`, "Fix pass — org-scoping +
 * silent failures"): every by-id lookup in this module now carries an
 * explicit `.eq('organization_id', orgId)`, even where the id being
 * looked up (a `unit_id` off an already org-scoped thread, an
 * `accountId` passed in by an org-scoped caller) looked safe by
 * chain-of-trust. RLS via `auth_org_ids()` is NOT a sufficient
 * substitute for this: it returns every org a user belongs to, so for
 * a management-company admin spanning several HOAs, an unscoped by-id
 * lookup can resolve a row that belongs to a DIFFERENT org than the
 * one the caller passed in, and this module has no way to know that
 * happened. Treat every new by-id lookup added here the same way.
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
    .eq('organization_id', orgId)
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
        .eq('organization_id', orgId)
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

/**
 * Default page size for `listThreads`. Exported so the page can compute
 * `offset`/total-pages from the SAME number the query itself paginates
 * with — a page-size mismatch between caller and query would make "Showing
 * X of Y" lie.
 */
export const INBOX_PAGE_SIZE = 50

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
 *
 * Paginated via `limit`/`offset` (Supabase `.range()`) rather than an
 * unbounded fetch — `countThreadsByStatus` counts every thread in a
 * status, and a status with more than one page must stay reachable
 * through repeated calls here, not silently cut off at the first page.
 * Ordering is `last_message_at DESC NULLS LAST`; `.range()` paginates
 * over that same fixed order on every call, so a null `last_message_at`
 * (sorted last) can't cause a row to be skipped or duplicated across
 * pages the way it could with a naive `WHERE last_message_at < cursor`
 * cursor, which would drop every null-dated thread silently.
 */
export async function listThreads(
  db: Db,
  orgId: string,
  filter: InboxFilter,
  limit = INBOX_PAGE_SIZE,
  offset = 0,
): Promise<ThreadListItem[]> {
  let query = db
    .from('inbox_threads')
    .select('id, subject, unit_id, match_confidence, status, last_message_at')
    .eq('organization_id', orgId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

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
      ? db
          .from('units')
          .select('id, address_line1')
          .eq('organization_id', orgId)
          .in('id', unitIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; address_line1: string }>,
          error: null,
        }),
    // `hasAttachments` drives a paperclip affordance the user can click to
    // expect a file — so it means "has an attachment that can actually be
    // opened", not merely "one was ever referenced". `pending`/`failed`
    // rows have no retrievable file yet (or ever); only `stored` does.
    db
      .from('inbox_attachments')
      .select('thread_id')
      .in('thread_id', threadIds)
      .eq('fetch_status', 'stored'),
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

// ─── Thread detail + property rail (Task 22) ────────────────────────────

export interface ThreadMessage {
  id: string
  direction: 'inbound' | 'outbound'
  fromName: string | null
  fromEmail: string | null
  toEmails: string[]
  subject: string | null
  bodyText: string | null
  strippedText: string | null
  sentAt: string | null
  attachments: Array<{
    id: string
    fileName: string
    sizeBytes: number | null
    fetchStatus: string
  }>
}

export interface ThreadDetail {
  id: string
  subject: string | null
  status: string
  unitId: string | null
  matchConfidence: string
  matchReason: Record<string, unknown> | null
  matchSource: string
  messages: ThreadMessage[]
}

/**
 * Everything the rail shows. This is the differentiator over Gmail, so it
 * is assembled eagerly rather than lazily behind clicks — context that is
 * hidden stops being checked.
 *
 * `degraded` lists which sections could not be loaded and were defaulted
 * to an empty/zero value rather than left absent. A manager reading
 * "Dues: Current" or "Open violations: None" must be able to tell that
 * apart from "we don't actually know" — a wrong figure here is exactly
 * the failure this screen exists to prevent. PropertyRail renders a
 * degraded section as an explicit "couldn't load" state instead of the
 * numeric default, rather than silently implying a false zero.
 */
export interface PropertyContext {
  address: string
  unitNumber: string | null
  residents: Array<{ name: string; role: string; email: string | null }>
  duesBalance: number
  duesOverdueCount: number
  openViolations: number
  openArcRequests: Array<{ id: string; summary: string; status: string }>
  openTickets: Array<{ id: string; subject: string; status: string }>
  lastCommunication: { subject: string; sentAt: string | null } | null
  degraded: Array<
    'residents' | 'dues' | 'violations' | 'arc' | 'tickets' | 'lastCommunication'
  >
}

/**
 * Loads a thread and its messages/attachments for the conversation pane.
 *
 * The thread and message queries define the page — a swallowed error here
 * would render an empty or truncated conversation, indistinguishable from
 * a genuinely quiet thread, so both throw. The attachment lookup only
 * enriches messages that already loaded successfully; a failure there
 * degrades every message to "no attachments" rather than failing the
 * whole thread view, the same stakes split listThreads/getConnectPreview
 * use above.
 */
export async function getThreadDetail(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<ThreadDetail | null> {
  const { data: thread, error: threadError } = await db
    .from('inbox_threads')
    .select('id, subject, status, unit_id, match_confidence, match_reason, match_source')
    .eq('organization_id', orgId)
    .eq('id', threadId)
    .maybeSingle()

  if (threadError) {
    logDbError('getThreadDetail', 'inbox_threads', { orgId, threadId }, threadError)
    throw new Error(`getThreadDetail: failed to load thread: ${threadError.message}`)
  }
  if (!thread) return null

  const { data: messages, error: messagesError } = await db
    .from('inbox_messages')
    .select(
      'id, direction, from_name, from_email, to_emails, subject, body_text, stripped_text, sent_at',
    )
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })

  if (messagesError) {
    logDbError('getThreadDetail', 'inbox_messages', { orgId, threadId }, messagesError)
    throw new Error(`getThreadDetail: failed to load messages: ${messagesError.message}`)
  }

  const messageIds = (messages ?? []).map((m) => m.id)
  const { data: attachments, error: attachmentsError } =
    messageIds.length > 0
      ? await db
          .from('inbox_attachments')
          .select('id, message_id, file_name, size_bytes, fetch_status')
          .in('message_id', messageIds)
          .neq('fetch_status', 'skipped')
      : {
          data: [] as Array<{
            id: string
            message_id: string
            file_name: string
            size_bytes: number | null
            fetch_status: string
          }>,
          error: null,
        }

  if (attachmentsError) {
    // Enrichment only — messages already loaded successfully above.
    // Degrade every message to "no attachments" rather than failing the
    // whole thread view over a missing paperclip.
    logDbError('getThreadDetail', 'inbox_attachments', { orgId, threadId }, attachmentsError)
  }

  return {
    id: thread.id,
    subject: thread.subject,
    status: thread.status,
    unitId: thread.unit_id,
    matchConfidence: thread.match_confidence,
    matchReason: thread.match_reason as Record<string, unknown> | null,
    matchSource: thread.match_source,
    messages: (messages ?? []).map((message) => ({
      id: message.id,
      direction: message.direction as 'inbound' | 'outbound',
      fromName: message.from_name,
      fromEmail: message.from_email,
      toEmails: message.to_emails ?? [],
      subject: message.subject,
      bodyText: message.body_text,
      strippedText: message.stripped_text,
      sentAt: message.sent_at,
      attachments: (attachments ?? [])
        .filter((a) => a.message_id === message.id)
        .map((a) => ({
          id: a.id,
          fileName: a.file_name,
          sizeBytes: a.size_bytes,
          fetchStatus: a.fetch_status,
        })),
    })),
  }
}

/**
 * Loads the property rail context for a unit already confirmed to be
 * attached to a thread.
 *
 * The unit lookup throws on error rather than returning null: a caller
 * that received `null` here could not tell "this unit doesn't exist"
 * apart from "the query failed" — and the thread page treats a null
 * context the same as "not filed yet" for a thread with no unitId, which
 * would misrepresent an actually-filed thread as unmatched. That is the
 * same shape as the attribution bug just fixed in ThreadList.tsx: branch
 * on ground truth (`unitId`) first, and if the enrichment fails, say so
 * honestly. See PropertyRail for how the caller turns a thrown error into
 * an explicit "couldn't load" state instead of "not filed".
 *
 * The six per-section lookups below (residents, dues, violations, arc,
 * tickets, last communication) enrich a unit already confirmed to exist:
 * fetched concurrently — never a per-row loop — and a failure in one
 * degrades only that section, tracked in `degraded` so the rail can say
 * "couldn't load" instead of implying a false zero.
 */
export async function getPropertyContext(
  db: Db,
  orgId: string,
  unitId: string,
): Promise<PropertyContext | null> {
  const { data: unit, error: unitError } = await db
    .from('units')
    .select('id, address_line1, unit_number, legacy_hoa_property_id')
    .eq('organization_id', orgId)
    .eq('id', unitId)
    .maybeSingle()

  if (unitError) {
    logDbError('getPropertyContext', 'units', { orgId, unitId }, unitError)
    throw new Error(`getPropertyContext: failed to load unit: ${unitError.message}`)
  }
  if (!unit) return null

  const legacyId = unit.legacy_hoa_property_id
  const degraded: PropertyContext['degraded'] = []

  const [residentsRes, assessmentsRes, violationsRes, arcRes, ticketsRes, commsRes] =
    await Promise.all([
      legacyId
        ? db
            .from('property_residents')
            .select('full_name, role, email')
            .eq('organization_id', orgId)
            .eq('property_id', legacyId)
            .is('moved_out_at', null)
            .is('deleted_at', null)
        : Promise.resolve({
            data: [] as Array<{ full_name: string; role: string; email: string | null }>,
            error: null as PostgrestError | null,
          }),
      // Status vocabulary is the DB CHECK constraint on assessments
      // (migrations/0006_accounting.sql): open|partial|paid|waived|
      // written_off. 'open'/'partial' are what's still outstanding —
      // netted against `payments` below (assessment.amount is the FULL
      // charge, not the remaining balance), mirroring
      // apps/hoa/src/lib/resident-dashboard.ts's getDues so a partially
      // paid assessment doesn't overstate what's owed.
      db
        .from('assessments')
        .select('id, amount, due_date, status')
        .eq('organization_id', orgId)
        .eq('unit_id', unitId)
        .in('status', ['open', 'partial'])
        .is('deleted_at', null),
      // hoa_violations keys its org column `org_id` (not
      // `organization_id` like every other table here) and its property
      // reference on `property_id` against the LEGACY hoa property id,
      // not unit_id — verified against database.types.ts, not the
      // brief's guess. Status vocabulary
      // (apps/hoa/src/lib/violation-statuses.ts): open|notice_sent|
      // fined|resolved|dismissed — "open" for the rail means anything
      // not yet closed out, not literally status = 'open', or a
      // violation sitting in notice_sent/fined would silently vanish
      // from the count.
      legacyId
        ? db
            .from('hoa_violations')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('property_id', legacyId)
            .not('status', 'in', '("resolved","dismissed")')
            .is('deleted_at', null)
        : Promise.resolve({ count: 0 as number | null, error: null as PostgrestError | null }),
      db
        .from('arc_requests')
        .select('id, summary, status')
        .eq('organization_id', orgId)
        .eq('unit_id', unitId)
        .not('status', 'in', '("approved","denied","withdrawn")')
        .is('deleted_at', null)
        .limit(5),
      db
        .from('tickets')
        .select('id, subject, status')
        .eq('organization_id', orgId)
        .eq('unit_id', unitId)
        .neq('status', 'closed')
        .is('deleted_at', null)
        .limit(5),
      db
        .from('communication_recipients')
        .select('communication_id, sent_at')
        .eq('organization_id', orgId)
        .eq('unit_id', unitId)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .limit(1),
    ])

  const { data: residentsData, error: residentsError } = residentsRes
  if (residentsError) {
    logDbError('getPropertyContext', 'property_residents', { orgId, unitId }, residentsError)
    degraded.push('residents')
  }

  const { data: assessmentsData, error: assessmentsError } = assessmentsRes
  let duesBalance = 0
  let duesOverdueCount = 0
  if (assessmentsError) {
    logDbError('getPropertyContext', 'assessments', { orgId, unitId }, assessmentsError)
    degraded.push('dues')
  } else {
    const assessments = assessmentsData ?? []
    if (assessments.length > 0) {
      const { data: payments, error: paymentsError } = await db
        .from('payments')
        .select('assessment_id, amount')
        .in(
          'assessment_id',
          assessments.map((a) => a.id),
        )

      if (paymentsError) {
        // Payments only refine the balance netting. Rather than hide the
        // balance entirely we still show the gross outstanding amount,
        // but flag it degraded — a partial payment not yet netted would
        // otherwise read as still fully owed.
        logDbError('getPropertyContext', 'payments', { orgId, unitId }, paymentsError)
        degraded.push('dues')
      }

      const paidByAssessment = new Map<string, number>()
      for (const p of payments ?? []) {
        if (!p.assessment_id) continue
        paidByAssessment.set(
          p.assessment_id,
          (paidByAssessment.get(p.assessment_id) ?? 0) + Number(p.amount),
        )
      }

      const today = new Date().toISOString().slice(0, 10)
      for (const a of assessments) {
        const remaining = Number(a.amount) - (paidByAssessment.get(a.id) ?? 0)
        if (remaining <= 0) continue
        duesBalance += remaining
        if (a.due_date && a.due_date <= today) duesOverdueCount++
      }
      duesBalance = Math.round(duesBalance * 100) / 100
    }
  }

  const { count: violationsCount, error: violationsError } = violationsRes
  if (violationsError) {
    logDbError('getPropertyContext', 'hoa_violations', { orgId, unitId }, violationsError)
    degraded.push('violations')
  }

  const { data: arcData, error: arcError } = arcRes
  if (arcError) {
    logDbError('getPropertyContext', 'arc_requests', { orgId, unitId }, arcError)
    degraded.push('arc')
  }

  const { data: ticketsData, error: ticketsError } = ticketsRes
  if (ticketsError) {
    logDbError('getPropertyContext', 'tickets', { orgId, unitId }, ticketsError)
    degraded.push('tickets')
  }

  const { data: commsData, error: commsError } = commsRes
  let lastCommunication: PropertyContext['lastCommunication'] = null
  if (commsError) {
    logDbError('getPropertyContext', 'communication_recipients', { orgId, unitId }, commsError)
    degraded.push('lastCommunication')
  } else {
    const lastRecipient = commsData?.[0]
    if (lastRecipient?.communication_id) {
      const { data: communication, error: communicationError } = await db
        .from('communications')
        .select('subject')
        .eq('organization_id', orgId)
        .eq('id', lastRecipient.communication_id)
        .is('deleted_at', null)
        .maybeSingle()

      if (communicationError) {
        logDbError('getPropertyContext', 'communications', { orgId, unitId }, communicationError)
        degraded.push('lastCommunication')
      } else if (communication) {
        lastCommunication = {
          subject: communication.subject,
          sentAt: lastRecipient.sent_at,
        }
      }
    }
  }

  return {
    address: unit.address_line1,
    unitNumber: unit.unit_number,
    residents: (residentsData ?? []).map((r) => ({
      name: r.full_name,
      role: r.role,
      email: r.email,
    })),
    duesBalance,
    duesOverdueCount,
    openViolations: violationsCount ?? 0,
    openArcRequests: (arcData ?? []).map((a) => ({
      id: a.id,
      summary: a.summary,
      status: a.status,
    })),
    openTickets: (ticketsData ?? []).map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
    })),
    lastCommunication,
    degraded,
  }
}

/**
 * Address label for a single unit — used to show what a suggested-but-
 * unconfirmed match would file under, before a manager confirms it. Not
 * page-defining, so a failure here degrades to no label (the assign form
 * still works without the suggestion text) rather than failing the page.
 */
export async function getUnitLabel(
  db: Db,
  orgId: string,
  unitId: string,
): Promise<{ unitId: string; address: string } | null> {
  const { data, error } = await db
    .from('units')
    .select('id, address_line1, unit_number')
    .eq('organization_id', orgId)
    .eq('id', unitId)
    .maybeSingle()

  if (error) {
    logDbError('getUnitLabel', 'units', { orgId, unitId }, error)
    return null
  }
  if (!data) return null

  return {
    unitId: data.id,
    address: data.unit_number ? `${data.address_line1} #${data.unit_number}` : data.address_line1,
  }
}
