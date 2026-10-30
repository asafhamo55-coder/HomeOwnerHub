import Link from 'next/link'
import { Inbox, MailPlus, Plug } from 'lucide-react'
import { Button, EmptyState, Page, PageHeader, Pager } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSignedInUser } from '@/lib/orgs'
import { timed } from '@/lib/perf/timing'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  countThreadsByStatus,
  defaultSnoozeScope,
  getDraftById,
  getMailboxStatus,
  getPropertyContext,
  listThreads,
  INBOX_PAGE_SIZE,
  type InboxFilter,
  type PropertyContext,
} from '@/lib/inbox/queries'
import { SplitPaneFrame, SplitPaneHeader, SplitPanePlaceholder } from '@/components/split-pane/SplitPane'
import { ThreadList } from './ThreadList'
import {
  BackfillAlert,
  INBOX_FILTERS,
  InboxFilterChips,
  InboxOwnerChips,
  MailboxSyncAlert,
  mailboxSummary,
} from './InboxChrome'
import type { MailboxStatusRead } from '@/lib/inbox/backfill-banner'
import { inboxQuery, parseOwnerFilter } from '@/lib/inbox/navigation'
import { loadInboxSlaHours } from '@/lib/inbox/waiting'
import { listAssignees } from '@/lib/inbox/assignees'
import { InboxKeyboard } from './InboxKeyboard'
import { UndoSendBanner } from './[id]/UndoSendBanner'
import { BatchBanner, type BatchGroupView } from './BatchBanner'
import { groupSimilarThreads } from '@/lib/inbox/batch/group'
import { getPrimaryAssociation } from '@/lib/vendors'
import { canSeeInboxTab } from '@/lib/messages/tabs'
import { getAnnouncementReply, listAnnouncementReplies } from '@/lib/messages/announcement-replies'
import { MessagesTabs } from '@/components/messages/MessagesTabs'
import { NewMessageMenu } from '@/components/messages/NewMessageMenu'
import { NewAnnouncementButton } from '@/components/announcements/NewAnnouncementButton'
import { InboxSourceChips } from '@/components/messages/InboxSourceChips'
import { AnnouncementReplies } from '@/components/messages/AnnouncementReplies'
import { loadDraftQuality } from '@/lib/inbox/draft/metrics-store'
import type { DraftQualitySummary } from '@/lib/inbox/draft/metrics'
import { DraftQualityCard } from './DraftQualityCard'

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
  searchParams: Promise<{ filter?: string; page?: string; owner?: string; undo?: string; from?: string; view?: string; reply?: string }>
}) {
  const params = await searchParams
  const owner = parseOwnerFilter(params.owner)
  // Inbox tables are gated by auth_is_board_or_admin at the RLS layer
  // (migration 0012 + the inbox migrations); requireBoardOrAdmin matches
  // that bar exactly. Mailbox *management* is deliberately narrower —
  // settings/mailbox/page.tsx and /api/oauth/google/start are admin-only,
  // because connecting or disconnecting hands Google standing access to
  // the whole mailbox. Hence `role` below: a board member reads the inbox
  // but must not be sent to a page that will bounce them.
  const { org, role } = await requireBoardOrAdmin()
  const canManageMailbox = role === 'admin'
  // BL-102 A11: this page is the Messages area's Inbox tab. The tab bar
  // reuses the gate above (canSeeInboxTab mirrors requireBoardOrAdmin).
  const showInboxTab = canSeeInboxTab(role)

  // "Replies to announcements": read-only, from communication_replies, and
  // independent of the Gmail mailbox (they arrive through Resend), so it
  // renders before — and regardless of — the mailbox checks below.
  if (params.view === 'replies') {
    return renderAnnouncementReplies(org.id, params)
  }

  const filter = (INBOX_FILTERS.find((f) => f.key === params.filter)?.key ??
    'needs_review') as InboxFilter

  const supabase = await getSupabaseServerClient()
  // Reads that need neither the counts nor the page offset start now, so
  // they run alongside the status and count reads instead of after them
  // (BL-099 static pass). Each keeps its own failure handling.
  const slaP = loadInboxSlaHours(supabase, org.id)
  slaP.catch(() => {}) // awaited below; marked handled until then
  // Enrichment only: a failed read shows "Assigned" instead of a name.
  const assigneeNamesP = listAssignees(org.id).then(
    (rows) => Object.fromEntries(rows.map((row) => [row.userId, row.name])),
    () => ({}) as Record<string, string>,
  )
  // BL-101 A10. Enrichment only: a failed read hides the card.
  const draftQualityP = timed('/inbox', 'inbox.draftQuality', () => loadDraftQuality(supabase, { orgId: org.id })).then(
    (q): DraftQualitySummary | null => q.summary,
    (err: unknown) => {
      console.error('InboxPage: draft quality read failed', {
        orgId: org.id,
        message: err instanceof Error ? err.message : String(err),
      })
      return null
    },
  )
  // "Approve and send" on the last thread in the queue lands here; the
  // reply's 30-second Undo comes along (see UndoSendBanner).
  const isId = (value: string | undefined): value is string => Boolean(value && /^[0-9a-f-]{36}$/i.test(value))
  const undoDraftP = isId(params.undo)
    ? getDraftById(supabase, org.id, params.undo).catch(() => null)
    : Promise.resolve(null)

  // Mine / Unassigned / All (BL-101 A6). requireBoardOrAdmin returns only
  // { role, org }; getSignedInUser is the request-memoized getUser the
  // layout already made, so this costs no extra auth round trip.
  const user = await getSignedInUser()
  const ownerScope = { owner, userId: user?.id ?? null }
  // BL-134: one snooze instant per request, so a snooze that expires
  // between the count and the list reads cannot make them disagree.
  const snooze = defaultSnoozeScope()

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
    timed('/inbox', 'inbox.counts', () => countThreadsByStatus(supabase, org.id, ownerScope, snooze)),
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

  const [threads, sla, assigneeNames, draftQuality] = await Promise.all([
    timed('/inbox', 'inbox.list', () => listThreads(supabase, org.id, filter, INBOX_PAGE_SIZE, offset, ownerScope, snooze)),
    slaP,
    assigneeNamesP,
    draftQualityP,
  ])
  const now = Date.now()

  // BL-101 A9: look-alike open questions on this page, offered as one
  // batch reply. Deterministic word overlap, no AI call, nothing stored.
  // Not on Closed/Waiting/Awaiting-resident views: nothing there needs it.
  const threadById = new Map(threads.map((t) => [t.id, t]))
  const batchGroups: BatchGroupView[] =
    filter === 'needs_review' || filter === 'open' || filter === 'all'
      ? groupSimilarThreads(threads).map((g) => ({
          label: g.label,
          threads: g.threadIds.flatMap((id) => {
            const t = threadById.get(id)
            return t
              ? [{ id, subject: t.subject, sender: t.fromName ?? t.fromEmail ?? 'Unknown', snippet: t.snippet }]
              : []
          }),
        }))
      : []

  const undoDraft = await undoDraftP

  if (statusRead === null) {
    return (
      <Page
        title="Messages"
        width="narrow"
        description="Resident email, matched to the homes it is about."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <NewAnnouncementButton />
            <NewMessageMenu />
          </div>
        }
        tabs={
          <div className="space-y-3">
            <MessagesTabs active="inbox" showInbox={showInboxTab} />
            <InboxSourceChips view="email" />
          </div>
        }
      >
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
          title="Messages"
          description={status ? mailboxSummary(status) : 'Mailbox status unavailable'}
          actions={
          <div className="flex flex-wrap items-center gap-2">
            <NewAnnouncementButton />
            <NewMessageMenu />
          </div>
        }
        />
        <MessagesTabs active="inbox" showInbox={showInboxTab} />
        <div className="flex flex-wrap items-center gap-2">
          <InboxSourceChips view="email" />
          <InboxFilterChips filter={filter} owner={owner} counts={counts} />
          <InboxOwnerChips filter={filter} owner={owner} />
        </div>
        <DraftQualityCard summary={draftQuality} />
      </SplitPaneHeader>
      <InboxKeyboard
        prevHref={null}
        nextHref={threads[0] ? `/inbox/${threads[0].id}${inboxQuery({ filter, owner, page })}` : null}
      />

      {status ? (
        <MailboxSyncAlert status={status} canManageMailbox={canManageMailbox} className="m-3 shrink-0 sm:mx-6" />
      ) : null}
      <BackfillAlert read={statusRead} canManageMailbox={canManageMailbox} className="m-3 shrink-0 sm:mx-6" />
      {undoDraft && undoDraft.status === 'queued' && undoDraft.sendAfter ? (
        <div className="m-3 shrink-0 sm:mx-6">
          <UndoSendBanner
            draftId={undoDraft.id}
            sendAfter={undoDraft.sendAfter}
            subject={undoDraft.subject}
            threadHref={isId(params.from) ? `/inbox/${params.from}${inboxQuery({ filter, owner })}` : null}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Conversations"
          className="flex w-full shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:w-[26rem]"
        >
          <BatchBanner groups={batchGroups} />
          {threads.length === 0 ? (
            // Snoozed threads (BL-134) are outside `all`, but the inbox is not empty.
            counts.all + (counts.snoozed ?? 0) > 0 ? (
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
                description="Mail syncs every 5 minutes. You can also start a conversation yourself."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/inbox/compose">New email</Link>
                  </Button>
                }
              />
            )
          ) : (
            <ThreadList
              threads={threads}
              filter={filter}
              owner={owner}
              page={page}
              now={now}
              sla={sla}
              assigneeNames={assigneeNames}
              currentUserId={user?.id ?? null}
            />
          )}
          <Pager
            page={page}
            pageSize={INBOX_PAGE_SIZE}
            total={total}
            rowCount={threads.length}
            hrefFor={(p) => `/inbox${inboxQuery({ filter, owner, page: p })}`}
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

/**
 * The Inbox tab's "Replies to announcements" view (BL-102 A11, read-only).
 * A failed list read throws to (dashboard)/error.tsx like the thread list;
 * a failed home read only costs the home panel.
 */
async function renderAnnouncementReplies(orgId: string, params: { page?: string; reply?: string }) {
  const supabase = await getSupabaseServerClient()
  const assoc = await getPrimaryAssociation()
  const associationName = assoc?.name ?? 'your HOA'
  const requested = Number.parseInt(params.page ?? '1', 10)
  const page = Number.isFinite(requested) && requested >= 1 ? requested : 1
  const isId = (value: string | undefined): value is string => Boolean(value && /^[0-9a-f-]{36}$/i.test(value))

  const [{ rows, total }, selected] = await Promise.all([
    listAnnouncementReplies(supabase, orgId, associationName, { page }),
    isId(params.reply) ? getAnnouncementReply(supabase, orgId, associationName, params.reply) : Promise.resolve(null),
  ])

  let home: PropertyContext | null = null
  let homeFailed = false
  if (selected?.unitId) {
    try {
      home = await getPropertyContext(supabase, orgId, selected.unitId)
    } catch (err) {
      homeFailed = true
      console.error('InboxPage: announcement reply home failed', {
        orgId,
        replyId: selected.id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <AnnouncementReplies
      replies={rows}
      total={total}
      page={page}
      selected={selected}
      home={home}
      homeFailed={homeFailed}
    />
  )
}
