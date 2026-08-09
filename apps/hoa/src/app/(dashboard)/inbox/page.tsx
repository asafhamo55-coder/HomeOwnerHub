import Link from 'next/link'
import { Alert } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  countThreadsByStatus,
  getMailboxStatus,
  listThreads,
  INBOX_PAGE_SIZE,
  type InboxFilter,
} from '@/lib/inbox/queries'
import { ThreadList } from './ThreadList'

export const metadata = { title: 'Inbox' }
export const dynamic = 'force-dynamic'

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'needs_review', label: 'Needs review' },
  { key: 'awaiting_resident', label: 'Awaiting resident' },
  { key: 'open', label: 'Open' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
]

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>
}) {
  const params = await searchParams
  // Inbox tables are gated by auth_is_board_or_admin at the RLS layer
  // (migration 0012 + the inbox migrations); requireBoardOrAdmin matches
  // that bar exactly. Mailbox *management* is deliberately narrower —
  // settings/mailbox/page.tsx and /api/oauth/google/start are admin-only,
  // because connecting or disconnecting hands Google standing access to
  // the whole mailbox. Hence `role` below: a board member reads the inbox
  // but must not be sent to a page that will bounce them.
  const { org, role } = await requireBoardOrAdmin()
  const canManageMailbox = role === 'admin'

  const filter = (FILTERS.find((f) => f.key === params.filter)?.key ??
    'needs_review') as InboxFilter

  const supabase = await getSupabaseServerClient()

  // Counts must land before the page/offset math below — `counts[filter]`
  // IS the total this page paginates over, so the count and the list can
  // never disagree the way they used to (list capped at 50, count
  // unbounded). Fetched alongside status; threads are fetched after,
  // once we know how many pages this filter actually has.
  const [status, counts] = await Promise.all([
    getMailboxStatus(supabase, org.id),
    countThreadsByStatus(supabase, org.id),
  ])

  const total = counts[filter] ?? 0
  const totalPages = Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE))
  const requestedPage = Number.parseInt(params.page ?? '1', 10)
  const page =
    Number.isFinite(requestedPage) && requestedPage >= 1
      ? Math.min(requestedPage, totalPages)
      : 1
  const offset = (page - 1) * INBOX_PAGE_SIZE

  const threads = await listThreads(supabase, org.id, filter, INBOX_PAGE_SIZE, offset)

  if (!status) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="info" title="No mailbox connected">
          Connect your HOA mailbox to see resident email here.{' '}
          {canManageMailbox ? (
            <Link href="/settings/mailbox" className="underline">
              Connect
            </Link>
          ) : (
            'Ask an HOA admin to connect it.'
          )}
        </Alert>
      </main>
    )
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Gated on `syncError`, NOT on `syncStatus !== 'ok'` (amended
          post-review — final branch review, Fix 2). A run that skipped
          messages it could not fetch or parse still finishes with
          sync_status='ok' and records the skip count in sync_error
          (packages/jobs/src/mailbox-sync.ts); the previous condition threw
          that away, so the inbox was silently missing mail while every
          surface read "Connected". Those messages are permanently skipped —
          the cursor moved past them — so this is the only place the board
          will ever hear about them.

          Amber for a partial sync, red only for auth_failed: "we have your
          mail, minus a few messages" and "we are not receiving your mail"
          must stay visually distinguishable, or the board learns to ignore
          both. */}
      {status.syncStatus !== 'ok' || status.syncError ? (
        <Alert
          variant={status.syncStatus === 'auth_failed' ? 'error' : 'warning'}
          title={
            status.syncStatus === 'auth_failed'
              ? 'Mailbox disconnected — reconnect required'
              : status.syncStatus === 'stalled'
                ? 'Mail sync has stalled'
                : // Covers both a partially-skipped run and a run that
                  // failed outright — mailboxSyncJob records sync_error
                  // without touching sync_status, so 'ok' + an error means
                  // either. See MailboxConnectCard for the full reasoning.
                  'Last sync reported a problem'
          }
          className="m-3"
        >
          {/* sync_error is written from a caught error's .message by the
              jobs layer (packages/jobs) — operator-facing diagnostic text,
              not user input. React escapes it as plain text content below,
              so it can't inject markup; it is never interpolated into an
              href, dangerouslySetInnerHTML, or any other raw sink. */}
          {status.syncError ?? 'Resident email may not be arriving.'}{' '}
          {/* Only admins can reach /settings/mailbox (requireAdmin) or
              start an OAuth connect, so linking a board member there
              lands them on a silent redirect to '/' with no explanation.
              Tell them who can fix it instead of offering a dead end. */}
          {canManageMailbox ? (
            <Link href="/settings/mailbox" className="underline">
              Fix
            </Link>
          ) : (
            'Ask an HOA admin to fix it.'
          )}
        </Alert>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-full max-w-sm shrink-0 overflow-y-auto border-r border-border xl:max-w-xs">
          <nav className="flex flex-wrap items-center gap-1 border-b border-border p-2 text-xs">
            {FILTERS.map((option) => (
              <Link
                key={option.key}
                href={`/inbox?filter=${option.key}`}
                className={`rounded-full px-2.5 py-1 ${
                  option.key === filter
                    ? 'bg-primary text-primary-fg'
                    : 'text-muted hover:bg-muted/10'
                }`}
              >
                {option.label} {counts[option.key] ?? 0}
              </Link>
            ))}
            <Link
              href="/inbox/compose"
              className="rounded-md border border-border px-3 py-1 text-xs text-foreground"
            >
              New email
            </Link>
          </nav>
          <ThreadList threads={threads} filter={filter} hasAnyThreads={counts.all > 0} />
          {total > 0 ? (
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted">
              <span>
                Showing {offset + 1}–{Math.min(offset + threads.length, total)} of {total}
              </span>
              <div className="flex gap-3">
                {page > 1 ? (
                  <Link
                    href={`/inbox?filter=${filter}&page=${page - 1}`}
                    className="underline hover:text-foreground"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="text-muted/50">Previous</span>
                )}
                {page < totalPages ? (
                  <Link
                    href={`/inbox?filter=${filter}&page=${page + 1}`}
                    className="underline hover:text-foreground"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="text-muted/50">Next</span>
                )}
              </div>
            </div>
          ) : null}
        </aside>

        <section className="hidden flex-1 items-center justify-center text-sm text-muted lg:flex">
          Select a conversation
        </section>
      </div>
    </main>
  )
}
