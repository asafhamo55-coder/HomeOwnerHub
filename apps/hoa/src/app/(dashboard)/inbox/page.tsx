import Link from 'next/link'
import { Inbox, MailPlus, PenSquare, Plug } from 'lucide-react'
import { Button, EmptyState, Page, PageHeader, Pager } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  countThreadsByStatus,
  getMailboxStatus,
  listThreads,
  INBOX_PAGE_SIZE,
  type InboxFilter,
} from '@/lib/inbox/queries'
import { SplitPaneFrame, SplitPaneHeader, SplitPanePlaceholder } from '@/components/split-pane/SplitPane'
import { ThreadList } from './ThreadList'
import { BackfillAlert, INBOX_FILTERS, InboxFilterChips, MailboxSyncAlert, mailboxSummary } from './InboxChrome'
import type { MailboxStatusRead } from '@/lib/inbox/backfill-banner'

export const metadata = { title: 'Inbox' }
export const dynamic = 'force-dynamic'

// Split-pane list/detail layout, deliberately NOT wrapped in <Page> (a
// fixed-width container would break its full-height panes). Load failures
// are honest already: the count and list reads throw on error, which lands
// on (dashboard)/error.tsx rather than an empty inbox. The mailbox status
// read is the exception — it is caught and shown as its own warning.
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

  const filter = (INBOX_FILTERS.find((f) => f.key === params.filter)?.key ??
    'needs_review') as InboxFilter

  const supabase = await getSupabaseServerClient()

  // Counts must land before the page/offset math below — `counts[filter]`
  // IS the total this page paginates over, so the count and the list can
  // never disagree the way they used to (list capped at 50, count
  // unbounded). Fetched alongside status; threads are fetched after,
  // once we know how many pages this filter actually has.
  //
  // The status read is caught on its own (BL-005): a failed read must not
  // take the whole inbox down, and it must not read as "No mailbox
  // connected" or as "import complete" either. It gets its own banner.
  const [statusRead, counts] = await Promise.all([
    getMailboxStatus(supabase, org.id).then(
      (status): MailboxStatusRead | null => (status ? { kind: 'loaded', status } : null),
      (err: unknown): MailboxStatusRead => {
        console.error('InboxPage: getMailboxStatus failed', {
          orgId: org.id,
          message: err instanceof Error ? err.message : String(err),
        })
        return { kind: 'failed' }
      },
    ),
    countThreadsByStatus(supabase, org.id),
  ])
  const status = statusRead?.kind === 'loaded' ? statusRead.status : null

  const total = counts[filter] ?? 0
  const totalPages = Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE))
  const requestedPage = Number.parseInt(params.page ?? '1', 10)
  const page =
    Number.isFinite(requestedPage) && requestedPage >= 1
      ? Math.min(requestedPage, totalPages)
      : 1
  const offset = (page - 1) * INBOX_PAGE_SIZE

  const threads = await listThreads(supabase, org.id, filter, INBOX_PAGE_SIZE, offset)

  if (statusRead === null) {
    return (
      <Page title="Inbox" width="narrow" description="Resident email, matched to the homes it is about.">
        <EmptyState
          icon={<Plug aria-hidden />}
          title="No mailbox connected"
          description={
            canManageMailbox
              ? 'Connect the HOA’s Gmail mailbox and resident email will appear here, filed under the right property.'
              : 'An HOA admin needs to connect the HOA’s Gmail mailbox before resident email can appear here.'
          }
          action={
            // Connecting is admin-only (settings/mailbox requires admin); a
            // board member is sent to the members list to find an admin.
            canManageMailbox ? (
              <Button asChild>
                <Link href="/settings/mailbox">
                  <Plug aria-hidden />
                  Connect mailbox
                </Link>
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link href="/settings/members">See your HOA admins</Link>
              </Button>
            )
          }
        />
      </Page>
    )
  }

  return (
    <SplitPaneFrame>
      <SplitPaneHeader>
        <PageHeader
          title="Inbox"
          description={status ? mailboxSummary(status) : 'Mailbox status unavailable'}
          actions={
            <Button asChild>
              <Link href="/inbox/compose">
          <PenSquare aria-hidden />
          New email
        </Link>
            </Button>
          }
        />
        <InboxFilterChips filter={filter} counts={counts} />
      </SplitPaneHeader>

      {status ? (
        <MailboxSyncAlert status={status} canManageMailbox={canManageMailbox} className="m-3 shrink-0 sm:mx-6" />
      ) : null}
      <BackfillAlert read={statusRead} canManageMailbox={canManageMailbox} className="m-3 shrink-0 sm:mx-6" />

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Conversations"
          className="flex w-full shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:w-[26rem]"
        >
          {threads.length === 0 ? (
            counts.all > 0 ? (
              <EmptyState
                variant="compact"
                icon={<Inbox aria-hidden />}
                title={filter === 'needs_review' ? 'Nothing needs review' : 'No conversations here'}
                description={
                  filter === 'needs_review'
                    ? 'Every conversation is filed under a property. New mail that can’t be matched lands here.'
                    : 'No conversations match this filter.'
                }
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/inbox?filter=all">Show all conversations</Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState
                variant="compact"
                icon={<MailPlus aria-hidden />}
                title="No mail yet"
                description="Mail syncs every 2 minutes. You can also start a conversation yourself."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/inbox/compose">New email</Link>
                  </Button>
                }
              />
            )
          ) : (
            <ThreadList threads={threads} filter={filter} page={page} />
          )}
          <Pager
            page={page}
            pageSize={INBOX_PAGE_SIZE}
            total={total}
            rowCount={threads.length}
            hrefFor={(p) => `/inbox?filter=${filter}&page=${p}`}
            linkAs={Link}
            noun="conversations"
            className="mt-auto border-t border-border"
          />
        </aside>

        <SplitPanePlaceholder
          icon={<Inbox aria-hidden />}
          title="Select a conversation"
          hint="Open a thread to read it, see the resident’s property at a glance, and draft a reply."
        />
      </div>
    </SplitPaneFrame>
  )
}
