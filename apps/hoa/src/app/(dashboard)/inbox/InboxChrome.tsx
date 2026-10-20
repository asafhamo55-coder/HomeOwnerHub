import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { Alert, FilterChips } from '@homeowner-portal/ui'
import { M3_APPLIED } from '@homeowner-portal/db/m3'
import type { InboxFilter, InboxOwnerFilter, MailboxStatus } from '@/lib/inbox/queries'
import { INBOX_OWNER_FILTERS, inboxQuery } from '@/lib/inbox/navigation'
import { backfillBanner, type MailboxStatusRead } from '@/lib/inbox/backfill-banner'

export const INBOX_FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'needs_review', label: 'Needs review' },
  { key: 'awaiting_resident', label: 'Awaiting resident' },
  { key: 'open', label: 'Open' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
  // BL-134 (migration 0067): threads snoozed into the future. Offered only
  // once M3_APPLIED; before that nothing can be snoozed.
  ...(M3_APPLIED ? [{ key: 'snoozed' as const, label: 'Snoozed' }] : []),
  // No "Filed in Gmail" chip. Mail the board filed or trashed in Gmail is
  // hidden and stays hidden: the count was noise in a work queue — it only
  // grows, and sitting beside "Needs review" it read as comparable work.
  // Madison Park showed 89 there against 2 threads actually in the Gmail
  // inbox. The rows are untouched and still queryable; they are just not
  // something the board is asked to look at.
]

export const INBOX_FILTER_LABEL = Object.fromEntries(
  INBOX_FILTERS.map((f) => [f.key, f.label]),
) as Record<InboxFilter, string>

/** Status chips. Counts come from `countThreadsByStatus`, which throws on failure — never a fake 0. */
export function InboxFilterChips({
  filter,
  owner = 'all',
  counts,
}: {
  filter: InboxFilter
  owner?: InboxOwnerFilter
  counts: Partial<Record<InboxFilter, number>>
}) {
  return (
    <FilterChips
      label="Filter conversations"
      linkAs={Link}
      className="w-fit max-w-full"
      items={INBOX_FILTERS.map((option) => ({
        label: option.label,
        href: `/inbox${inboxQuery({ filter: option.key, owner })}`,
        active: option.key === filter,
        count: counts[option.key] ?? 0,
      }))}
    />
  )
}

/**
 * Mine / Unassigned / All (BL-101 A6). Narrows whichever status chip is
 * active; the status counts above follow it. No counts of its own: they
 * would be three more queries for a number the status chips already show.
 */
export function InboxOwnerChips({ filter, owner }: { filter: InboxFilter; owner: InboxOwnerFilter }) {
  return (
    <FilterChips
      label="Whose conversations"
      linkAs={Link}
      className="w-fit max-w-full"
      items={INBOX_OWNER_FILTERS.map((option) => ({
        label: option.label,
        href: `/inbox${inboxQuery({ filter, owner: option.key })}`,
        active: option.key === owner,
      }))}
    />
  )
}

/** One line under the title: which mailbox, and when it last synced. */
export function mailboxSummary(status: MailboxStatus): string {
  const synced = status.lastSyncedAt
    ? `synced ${formatDistanceToNowStrict(new Date(status.lastSyncedAt), { addSuffix: true })}`
    : 'not synced yet'
  return `${status.emailAddress} · ${synced}`
}

/**
 * Gated on `syncError`, NOT on `syncStatus !== 'ok'` (amended post-review —
 * final branch review, Fix 2). A run that skipped messages it could not
 * fetch or parse still finishes with sync_status='ok' and records the skip
 * count in sync_error (packages/jobs/src/mailbox-sync.ts); the previous
 * condition threw that away, so the inbox was silently missing mail while
 * every surface read "Connected". Those messages are permanently skipped —
 * the cursor moved past them — so this is the only place the board will
 * ever hear about them.
 *
 * Warning for a partial sync, error only for auth_failed: "we have your
 * mail, minus a few messages" and "we are not receiving your mail" must
 * stay visually distinguishable, or the board learns to ignore both.
 */
export function MailboxSyncAlert({
  status,
  canManageMailbox,
  className,
}: {
  status: MailboxStatus
  canManageMailbox: boolean
  className?: string
}) {
  if (status.syncStatus === 'ok' && !status.syncError) return null
  return (
    <Alert
      variant={status.syncStatus === 'auth_failed' ? 'error' : 'warning'}
      title={
        status.syncStatus === 'auth_failed'
          ? 'Mailbox disconnected — reconnect required'
          : status.syncStatus === 'stalled'
            ? 'Mail sync has stalled'
            : // Covers both a partially-skipped run and a run that failed
              // outright — mailboxSyncJob records sync_error without
              // touching sync_status, so 'ok' + an error means either. See
              // MailboxConnectCard for the full reasoning.
              'Last sync reported a problem'
      }
      className={className}
    >
      {/* sync_error is written from a caught error's .message by the jobs
          layer (packages/jobs) — operator-facing diagnostic text, not user
          input. React escapes it as plain text content, so it can't inject
          markup; it is never interpolated into an href or any raw sink. */}
      {status.syncError ?? 'Resident email may not be arriving.'}{' '}
      {/* Only admins can reach /settings/mailbox (requireAdmin) or start an
          OAuth connect, so linking a board member there lands them on a
          silent redirect to '/' with no explanation. Tell them who can fix
          it instead of offering a dead end. */}
      {canManageMailbox ? <Link href="/settings/mailbox">Fix it in mailbox settings</Link> : 'Ask an HOA admin to fix it.'}
    </Alert>
  )
}

/**
 * History-import progress / failure (BL-005). Copy and state come from
 * `backfillBanner`; hidden once the import is done. A failed status read
 * renders its own warning rather than disappearing.
 */
export function BackfillAlert({
  read,
  canManageMailbox,
  className,
}: {
  read: MailboxStatusRead
  canManageMailbox: boolean
  className?: string
}) {
  const banner = backfillBanner(read, canManageMailbox)
  if (!banner) return null
  return (
    <Alert variant={banner.variant} title={banner.title} className={className}>
      <p>
        {banner.body}
        {banner.action ? (
          <>
            {' '}
            <Link href={banner.action.href}>{banner.action.label}</Link>
          </>
        ) : null}
      </p>
      {banner.percent !== null ? (
        <div
          className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-surface"
          role="progressbar"
          aria-valuenow={banner.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="History import progress"
        >
          <div className="h-full rounded-full bg-info-solid" style={{ width: `${banner.percent}%` }} />
        </div>
      ) : null}
    </Alert>
  )
}
